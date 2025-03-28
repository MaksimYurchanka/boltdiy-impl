/*
  # Create tasks table and related schemas

  1. New Tables
    - `tasks`
      - `id` (uuid, primary key)
      - `status` (text, not null)
      - `prompt` (text, not null)
      - `context` (text)
      - `implementation` (text)
      - `error` (jsonb)
      - `token_usage` (jsonb)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `tasks` table
    - Add policy for authenticated users to access their tasks
*/

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  prompt text NOT NULL,
  context text,
  implementation text,
  error jsonb,
  token_usage jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users
CREATE POLICY "Allow authenticated access" ON tasks
  FOR ALL
  TO authenticated
  USING (true);

-- Create index for status queries
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

-- Create function to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updated_at
CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();