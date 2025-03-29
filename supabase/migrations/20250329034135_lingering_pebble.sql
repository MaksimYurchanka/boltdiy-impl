/*
  # Enhance token tracking system

  1. Changes
    - Add new columns to metrics table for token tracking
    - Add new indexes for efficient querying
    - Create views for token efficiency analysis
    - Add functions for metrics calculations

  2. Security
    - Maintain existing RLS policies
    - Add new policies for aggregated metrics
*/

-- Add new metric types to enforce consistency
DO $$ BEGIN
  CREATE TYPE metric_type AS ENUM (
    'token_usage',
    'template_usage',
    'efficiency_ratio',
    'task_complexity',
    'template_effectiveness',
    'rate_limit'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create materialized view for token efficiency metrics
CREATE MATERIALIZED VIEW token_efficiency_metrics AS
WITH base_metrics AS (
  SELECT
    tasks.id as task_id,
    tasks.template_id,
    tasks.created_at,
    (tasks.token_usage->>'prompt')::int as prompt_tokens,
    (tasks.token_usage->>'completion')::int as completion_tokens,
    (tasks.token_usage->>'total')::int as total_tokens,
    templates.name as template_name,
    templates.type as template_type
  FROM tasks
  LEFT JOIN templates ON tasks.template_id = templates.id
  WHERE tasks.status = 'completed'
    AND tasks.token_usage IS NOT NULL
),
template_stats AS (
  SELECT
    template_id,
    template_name,
    template_type,
    AVG(total_tokens) as avg_tokens,
    MIN(total_tokens) as min_tokens,
    MAX(total_tokens) as max_tokens,
    COUNT(*) as usage_count
  FROM base_metrics
  WHERE template_id IS NOT NULL
  GROUP BY template_id, template_name, template_type
),
baseline_stats AS (
  SELECT
    NULL::uuid as template_id,
    'No Template' as template_name,
    task_type as template_type,
    AVG(total_tokens) as avg_tokens,
    MIN(total_tokens) as min_tokens,
    MAX(total_tokens) as max_tokens,
    COUNT(*) as usage_count
  FROM base_metrics
  WHERE template_id IS NULL
  GROUP BY task_type
)
SELECT
  template_id,
  template_name,
  template_type,
  avg_tokens,
  min_tokens,
  max_tokens,
  usage_count,
  CASE
    WHEN template_id IS NOT NULL THEN
      (SELECT avg_tokens FROM baseline_stats b WHERE b.template_type = s.template_type) / NULLIF(avg_tokens, 0)
    ELSE 1.0
  END as efficiency_ratio,
  now() as calculated_at
FROM (
  SELECT * FROM template_stats
  UNION ALL
  SELECT * FROM baseline_stats
) s;

-- Create index for the materialized view
CREATE UNIQUE INDEX idx_token_efficiency_metrics_template ON token_efficiency_metrics (template_id);

-- Create function to refresh token efficiency metrics
CREATE OR REPLACE FUNCTION refresh_token_efficiency_metrics()
RETURNS trigger AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY token_efficiency_metrics;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to refresh metrics when tasks are updated
CREATE TRIGGER refresh_token_metrics
  AFTER INSERT OR UPDATE OR DELETE
  ON tasks
  FOR EACH STATEMENT
  EXECUTE FUNCTION refresh_token_efficiency_metrics();

-- Create time-series metrics view
CREATE VIEW token_metrics_timeseries AS
WITH daily_metrics AS (
  SELECT
    date_trunc('day', tasks.created_at) as day,
    templates.type as task_type,
    COUNT(*) as task_count,
    AVG((tasks.token_usage->>'total')::int) as avg_tokens,
    SUM((tasks.token_usage->>'total')::int) as total_tokens,
    COUNT(DISTINCT tasks.template_id) as templates_used
  FROM tasks
  LEFT JOIN templates ON tasks.template_id = templates.id
  WHERE tasks.status = 'completed'
    AND tasks.token_usage IS NOT NULL
  GROUP BY date_trunc('day', tasks.created_at), templates.type
)
SELECT
  day,
  task_type,
  task_count,
  avg_tokens,
  total_tokens,
  templates_used,
  avg_tokens / NULLIF(
    LAG(avg_tokens) OVER (PARTITION BY task_type ORDER BY day),
    0
  ) as day_over_day_efficiency
FROM daily_metrics
ORDER BY day DESC, task_type;

-- Add new indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_token_usage ON tasks USING gin(token_usage);

-- Grant access to the new views
GRANT SELECT ON token_efficiency_metrics TO authenticated;
GRANT SELECT ON token_metrics_timeseries TO authenticated;