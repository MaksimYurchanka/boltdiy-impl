/*
  # Create API keys table and related schemas

  1. New Tables
    - `api_keys`
      - `id` (uuid, primary key)
      - `key_hash` (text, not null)
      - `name` (text, not null)
      - `user_id` (uuid, references auth.users)
      - `created_at` (timestamptz)
      - `expires_at` (timestamptz)
      - `last_used_at` (timestamptz)

  2. Security
    - Enable RLS on `api_keys` table
    - Add policy for users to read their own API keys
*/

CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash text NOT NULL,
  name text NOT NULL,
  user_id uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  last_used_at timestamptz
);

-- Enable RLS
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Create policy for users to read their own API keys
CREATE POLICY "Users can read own API keys"
  ON api_keys
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Create index for user_id lookups
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_api_keys_updated_at
  BEFORE UPDATE ON api_keys
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();