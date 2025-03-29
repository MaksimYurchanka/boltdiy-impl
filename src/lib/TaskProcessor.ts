import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { BoltDiyClient } from './BoltDiyClient';
import { FileManager } from './FileManager';
import { EventPublisher } from './EventPublisher';

export class TaskProcessor {
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly boltDiyClient: BoltDiyClient,
    private readonly fileManager: FileManager,
    private readonly eventPublisher: EventPublisher
  ) {}

  async processTask(taskId: string): Promise<void> {
    try {
      // Start streaming updates
      this.boltDiyClient.streamImplementation(taskId, this.eventPublisher)
        .catch(error => {
          console.error(`Streaming error: ${error.message}`);
        });

      let completed = false;
      let retries = 0;
      const MAX_RETRIES = 30; // 5 minutes at 10-second intervals

      while (!completed && retries < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds

        const status = await this.boltDiyClient.getTaskStatus(taskId);

        // Publish status update
        this.eventPublisher.publish(taskId, {
          type: 'task.status',
          data: {
            status: status.status,
            progress: status.progress,
          },
          timestamp: new Date().toISOString(),
        });

        if (status.status === 'completed') {
          completed = true;

          // Get implementation result
          const result = await this.boltDiyClient.getImplementation(taskId);

          // Update task with implementation
          const { error: updateError } = await this.supabase
            .from('tasks')
            .update({
              status: 'completed',
              implementation: result.implementation,
            })
            .eq('id', taskId);

          if (updateError) {
            throw new Error(`Failed to update task: ${updateError.message}`);
          }

          // Upload files to storage if present
          if (result.files?.length) {
            for (const file of result.files) {
              await this.fileManager.uploadFile(
                'system',
                taskId,
                file.name,
                file.content
              );
            }
          }

          // Publish completion event
          this.eventPublisher.publish(taskId, {
            type: 'task.completion',
            data: {
              implementation: result.implementation,
              files: result.files,
            },
            timestamp: new Date().toISOString(),
          });

          // Close the event stream
          this.eventPublisher.close(taskId);
        } else if (status.status === 'failed') {
          // Update task as failed
          const { error: updateError } = await this.supabase
            .from('tasks')
            .update({
              status: 'failed',
              error: {
                code: 'bolt_diy_processing_error',
                message: 'Task processing failed in bolt.diy',
              },
            })
            .eq('id', taskId);

          if (updateError) {
            throw new Error(`Failed to update task: ${updateError.message}`);
          }

          // Publish failure event
          this.eventPublisher.publish(taskId, {
            type: 'task.error',
            data: {
              code: 'bolt_diy_processing_error',
              message: 'Task processing failed in bolt.diy',
            },
            timestamp: new Date().toISOString(),
          });

          completed = true;
          this.eventPublisher.close(taskId);
        }

        retries++;
      }

      // Handle timeout
      if (!completed) {
        const { error: timeoutError } = await this.supabase
          .from('tasks')
          .update({
            status: 'failed',
            error: {
              code: 'timeout',
              message: 'Task processing timed out',
            },
          })
          .eq('id', taskId);

        if (timeoutError) {
          throw new Error(`Failed to update task: ${timeoutError.message}`);
        }

        // Publish timeout event
        this.eventPublisher.publish(taskId, {
          type: 'task.error',
          data: {
            code: 'timeout',
            message: 'Task processing timed out',
          },
          timestamp: new Date().toISOString(),
        });

        this.eventPublisher.close(taskId);
      }
    } catch (error) {
      console.error(`Background processing error for task ${taskId}:`, error);

      // Update task as failed
      const { error: updateError } = await this.supabase
        .from('tasks')
        .update({
          status: 'failed',
          error: {
            code: 'background_processing_error',
            message: error.message,
          },
        })
        .eq('id', taskId);

      if (updateError) {
        console.error('Failed to update task error status:', updateError);
      }

      // Publish error event
      this.eventPublisher.publish(taskId, {
        type: 'task.error',
        data: {
          code: 'background_processing_error',
          message: error.message,
        },
        timestamp: new Date().toISOString(),
      });

      this.eventPublisher.close(taskId);
    }
  }
}