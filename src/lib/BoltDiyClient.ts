import { z } from 'zod';
import { EventPublisher, EventData } from './EventPublisher';

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
    this.timeout = config.timeout || 30000;
    this.retries = config.retries || 3;
    this.retryDelay = config.retryDelay || 1000;
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

  async streamImplementation(taskId: string, eventPublisher: EventPublisher): Promise<void> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/implementation/${taskId}/stream`,
        {
          headers: {
            'Accept': 'text/event-stream',
            'Cache-Control': 'no-cache',
          },
          signal: AbortSignal.timeout(this.timeout * 10), // Longer timeout for streaming
        }
      );

      if (!response.ok || !response.body) {
        throw new Error(`bolt.diy stream failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = this.extractEvents(buffer);
        buffer = events.remainder;

        for (const event of events.complete) {
          eventPublisher.publish(taskId, {
            type: event.type,
            data: event.data,
            timestamp: new Date().toISOString(),
          });
        }
      }
    } catch (error) {
      eventPublisher.publish(taskId, {
        type: 'error',
        data: {
          message: `Stream error: ${error.message}`,
        },
        timestamp: new Date().toISOString(),
      });

      throw error;
    }
  }

  private extractEvents(buffer: string): {
    complete: Array<{ type: string; data: unknown }>;
    remainder: string;
  } {
    const events: Array<{ type: string; data: unknown }> = [];
    const lines = buffer.split('\n');
    let currentEvent: { type?: string; data?: string } = {};
    let remainder = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.startsWith('event:')) {
        currentEvent.type = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        currentEvent.data = line.slice(5).trim();
      } else if (line === '') {
        if (currentEvent.type && currentEvent.data) {
          try {
            events.push({
              type: currentEvent.type,
              data: JSON.parse(currentEvent.data),
            });
          } catch (error) {
            console.error('Failed to parse event data:', error);
          }
        }
        currentEvent = {};
      } else {
        remainder = lines.slice(i).join('\n');
        break;
      }
    }

    return { complete: events, remainder };
  }
}