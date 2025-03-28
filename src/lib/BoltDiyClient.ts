import { z } from 'zod';

// Validation schemas
const taskResponseSchema = z.object({
  taskId: z.string().uuid(),
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
});

const taskStatusSchema = z.object({
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  progress: z.number().min(0).max(100).optional(),
});

const implementationSchema = z.object({
  implementation: z.string(),
  files: z.array(z.object({
    name: z.string(),
    content: z.string(),
  })).optional(),
});

export class BoltDiyError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'BoltDiyError';
  }
}

export interface BoltDiyConfig {
  baseUrl: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

export class BoltDiyClient {
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly retries: number;
  private readonly retryDelay: number;

  constructor(config: BoltDiyConfig) {
    this.baseUrl = config.baseUrl;
    this.timeout = config.timeout || 30000; // 30 seconds default
    this.retries = config.retries || 3;
    this.retryDelay = config.retryDelay || 1000; // 1 second default
  }

  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    retries = this.retries
  ): Promise<Response> {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new BoltDiyError(
          'request_failed',
          `bolt.diy returned status: ${response.status}`,
          { status: response.status }
        );
      }

      return response;
    } catch (error) {
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        return this.fetchWithRetry(url, options, retries - 1);
      }
      throw new BoltDiyError(
        'request_failed',
        `Failed to communicate with bolt.diy: ${error.message}`,
        { originalError: error }
      );
    }
  }

  async submitTask(task: {
    prompt: string;
    context?: Record<string, unknown>;
    files?: Array<{ name: string; content: string }>;
  }): Promise<{ taskId: string; status: string }> {
    const response = await this.fetchWithRetry(
      `${this.baseUrl}/api/implementation`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(task),
      }
    );

    const data = await response.json();
    return taskResponseSchema.parse(data);
  }

  async getTaskStatus(taskId: string): Promise<{ status: string; progress?: number }> {
    const response = await this.fetchWithRetry(
      `${this.baseUrl}/api/implementation/${taskId}/status`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const data = await response.json();
    return taskStatusSchema.parse(data);
  }

  async getImplementation(taskId: string): Promise<{
    implementation: string;
    files?: Array<{ name: string; content: string }>;
  }> {
    const response = await this.fetchWithRetry(
      `${this.baseUrl}/api/implementation/${taskId}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const data = await response.json();
    return implementationSchema.parse(data);
  }
}