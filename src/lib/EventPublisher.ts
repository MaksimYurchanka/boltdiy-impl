import { ReadableStreamDefaultController } from 'stream/web';

export type EventData = {
  type: string;
  data: unknown;
  timestamp: string;
};

export class EventPublisher {
  private subscribers = new Map<string, Map<string, ReadableStreamDefaultController<string>>>();

  subscribe(taskId: string, connectionId: string, controller: ReadableStreamDefaultController<string>): string {
    if (!this.subscribers.has(taskId)) {
      this.subscribers.set(taskId, new Map());
    }
    
    this.subscribers.get(taskId)!.set(connectionId, controller);
    return connectionId;
  }

  unsubscribe(taskId: string, connectionId: string): void {
    const taskSubscribers = this.subscribers.get(taskId);
    if (!taskSubscribers) return;

    taskSubscribers.delete(connectionId);
    if (taskSubscribers.size === 0) {
      this.subscribers.delete(taskId);
    }
  }

  publish(taskId: string, event: EventData): void {
    const subscribers = this.subscribers.get(taskId);
    if (!subscribers) return;

    const message = `event: ${event.type}\ndata: ${JSON.stringify({ ...event.data, timestamp: event.timestamp })}\n\n`;

    for (const [connectionId, controller] of subscribers.entries()) {
      try {
        controller.enqueue(message);
      } catch (error) {
        console.error(`Error sending event to subscriber ${connectionId}:`, error);
        this.unsubscribe(taskId, connectionId);
      }
    }
  }

  close(taskId: string): void {
    const subscribers = this.subscribers.get(taskId);
    if (!subscribers) return;

    for (const [connectionId, controller] of subscribers.entries()) {
      try {
        controller.close();
      } catch (error) {
        console.error(`Error closing stream for subscriber ${connectionId}:`, error);
      }
    }

    this.subscribers.delete(taskId);
  }
}