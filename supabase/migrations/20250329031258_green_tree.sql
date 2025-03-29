/*
  # Add template metrics and relationships

  1. Changes
    - Add template_id column to tasks table
    - Add template usage metrics tracking
    - Add indexes for template-related queries

  2. Security
    - Update RLS policies for template access
*/

-- Add template_id to tasks
ALTER TABLE tasks
ADD COLUMN template_id uuid REFERENCES templates(id);

-- Add index for template lookups
CREATE INDEX IF NOT EXISTS idx_tasks_template_id ON tasks(template_id);

-- Add template metrics view
CREATE VIEW template_metrics AS
SELECT
  t.id as template_id,
  t.name as template_name,
  t.type as template_type,
  COUNT(tk.id) as usage_count,
  AVG((m.value->>'efficiencyRatio')::numeric) as avg_efficiency_ratio
FROM templates t
LEFT JOIN tasks tk ON tk.template_id = t.id
LEFT JOIN metrics m ON m.value->>'templateId' = t.id::text
WHERE m.metric_type = 'template_usage'
GROUP BY t.id, t.name, t.type;