/*
  # Create metrics table for token efficiency analysis

  1. New Tables
    - `metrics`
      - `id` (uuid, primary key)
      - `metric_type` (text, not null)
      - `value` (jsonb, not null)
      - `timestamp` (timestamptz)

  2. Security
    - Enable RLS on `metrics` table
    - Add policy for authenticated users to read metrics
*/

CREATE TABLE IF NOT EXISTS metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_type text NOT NULL,
  value jsonb NOT NULL,
  timestamp timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE metrics ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users to read metrics
CREATE POLICY "Authenticated users can read metrics"
  ON metrics
  FOR SELECT
  TO authenticated
  USING (true);

-- Create index for metric type lookups
CREATE INDEX IF NOT EXISTS idx_metrics_type ON metrics(metric_type);