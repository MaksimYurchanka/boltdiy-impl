/*
  # Create templates table and related schemas

  1. New Tables
    - `templates`
      - `id` (uuid, primary key)
      - `name` (text, not null)
      - `type` (text, not null)
      - `content` (text, not null)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `templates` table
    - Add policy for public read access
*/

CREATE TABLE IF NOT EXISTS templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

-- Create policy for public read access
CREATE POLICY "Public read access for templates"
  ON templates
  FOR SELECT
  TO authenticated
  USING (true);

-- Create index for template type lookups
CREATE INDEX IF NOT EXISTS idx_templates_type ON templates(type);

-- Create trigger for updated_at
CREATE TRIGGER update_templates_updated_at
  BEFORE UPDATE ON templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();