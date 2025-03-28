/*
  # Create storage buckets for project files

  1. Storage Buckets
    - Create project-files bucket
    - Set up RLS policies for secure access

  2. Security
    - Add policies for reading and uploading files
    - Restrict access to authenticated users
*/

-- Create project files bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-files', 'Project Files', false)
ON CONFLICT (id) DO NOTHING;

-- Set up RLS policies for project files
CREATE POLICY "Users can read own project files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'project-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload own project files"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'project-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own project files"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'project-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own project files"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'project-files' AND auth.uid()::text = (storage.foldername(name))[1]);