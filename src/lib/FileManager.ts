import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export class FileManager {
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly bucketName = 'project-files'
  ) {}

  async uploadFile(
    userId: string,
    taskId: string,
    fileName: string,
    content: string
  ): Promise<string> {
    const filePath = `${userId}/${taskId}/${fileName}`;
    const contentBuffer = new TextEncoder().encode(content);

    const { error: uploadError } = await this.supabase.storage
      .from(this.bucketName)
      .upload(filePath, contentBuffer, {
        contentType: 'text/plain',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Failed to upload file: ${uploadError.message}`);
    }

    const { data: urlData, error: urlError } = await this.supabase.storage
      .from(this.bucketName)
      .createSignedUrl(filePath, 3600); // 1 hour expiry

    if (urlError || !urlData) {
      throw new Error(`Failed to generate signed URL: ${urlError?.message}`);
    }

    return urlData.signedUrl;
  }

  async downloadFile(
    userId: string,
    taskId: string,
    fileName: string
  ): Promise<string> {
    const filePath = `${userId}/${taskId}/${fileName}`;

    const { data, error } = await this.supabase.storage
      .from(this.bucketName)
      .download(filePath);

    if (error || !data) {
      throw new Error(`Failed to download file: ${error?.message}`);
    }

    return await data.text();
  }

  async listFiles(userId: string, taskId: string): Promise<string[]> {
    const prefix = `${userId}/${taskId}/`;

    const { data, error } = await this.supabase.storage
      .from(this.bucketName)
      .list(prefix);

    if (error) {
      throw new Error(`Failed to list files: ${error.message}`);
    }

    return data.map(file => file.name);
  }

  async deleteFile(
    userId: string,
    taskId: string,
    fileName: string
  ): Promise<void> {
    const filePath = `${userId}/${taskId}/${fileName}`;

    const { error } = await this.supabase.storage
      .from(this.bucketName)
      .remove([filePath]);

    if (error) {
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }
}