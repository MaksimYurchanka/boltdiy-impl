import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { z } from 'npm:zod@3.22.4';
import { v4 as uuidv4 } from 'npm:uuid@9.0.1';
import { Anthropic } from 'npm:@anthropic-ai/sdk@0.18.0';

// Types
interface Task {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  prompt: string;
  context?: string;
  implementation?: string;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  createdAt: Date;
  updatedAt: Date;
}

// In-memory storage (replace with Supabase in production)
const tasks = new Map<string, Task>();

// Validation schemas
const taskSchema = z.object({
  prompt: z.string().min(1, "Prompt cannot be empty"),
  context: z.string().optional(),
});

const taskUpdateSchema = z.object({
  prompt: z.string().min(1).optional(),
  context: z.string().optional(),
  status: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
});

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});

// Error handling
class APIError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
    public status: number = 400,
  ) {
    super(message);
  }
}

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Idempotency-Key',
};

// Middleware
const authenticate = (req: Request): void => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new APIError('authentication_error', 'Invalid authentication token', undefined, 401);
  }
  // TODO: Implement proper token validation
};

const handleIdempotency = async (req: Request): Promise<Response | null> => {
  const idempotencyKey = req.headers.get('Idempotency-Key');
  if (!idempotencyKey) return null;

  // TODO: Implement proper idempotency check with Supabase
  return null;
};

// Route handlers
const createTask = async (req: Request): Promise<Response> => {
  const body = await req.json();
  const validatedData = taskSchema.parse(body);

  const taskId = uuidv4();
  const task: Task = {
    id: taskId,
    status: 'pending',
    prompt: validatedData.prompt,
    context: validatedData.context,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  tasks.set(taskId, task);

  // Initialize Claude API client
  const anthropic = new Anthropic({
    apiKey: Deno.env.get('ANTHROPIC_API_KEY') || '',
  });

  try {
    const completion = await anthropic.messages.create({
      model: 'claude-3-opus-20240229',
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: validatedData.prompt,
        },
      ],
    });

    task.implementation = completion.content[0].text;
    task.status = 'completed';
    task.updatedAt = new Date();
    tasks.set(taskId, task);

    return new Response(
      JSON.stringify({ 
        success: true, 
        taskId,
        status: task.status 
      }),
      { 
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders 
        } 
      }
    );
  } catch (error) {
    task.status = 'failed';
    task.error = {
      code: 'claude_api_error',
      message: error.message,
    };
    task.updatedAt = new Date();
    tasks.set(taskId, task);

    throw new APIError('server_error', 'Failed to process task', { error: error.message });
  }
};

const getTaskStatus = (taskId: string): Response => {
  const task = tasks.get(taskId);
  if (!task) {
    throw new APIError('not_found', 'Task not found', undefined, 404);
  }

  return new Response(
    JSON.stringify({
      success: true,
      status: task.status,
      error: task.error,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    }),
    { 
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders 
      } 
    }
  );
};

const getTaskImplementation = (taskId: string): Response => {
  const task = tasks.get(taskId);
  if (!task) {
    throw new APIError('not_found', 'Task not found', undefined, 404);
  }

  if (task.status !== 'completed') {
    throw new APIError(
      'invalid_request',
      'Implementation not available',
      { status: task.status },
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      implementation: task.implementation,
      status: task.status,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    }),
    { 
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders 
      } 
    }
  );
};

const updateTask = async (req: Request, taskId: string): Promise<Response> => {
  const task = tasks.get(taskId);
  if (!task) {
    throw new APIError('not_found', 'Task not found', undefined, 404);
  }

  const body = await req.json();
  const validatedData = taskUpdateSchema.parse(body);

  // Update task properties
  if (validatedData.prompt) task.prompt = validatedData.prompt;
  if (validatedData.context) task.context = validatedData.context;
  if (validatedData.status) task.status = validatedData.status;
  task.updatedAt = new Date();

  tasks.set(taskId, task);

  return new Response(
    JSON.stringify({
      success: true,
      task: {
        id: task.id,
        status: task.status,
        prompt: task.prompt,
        context: task.context,
        updatedAt: task.updatedAt,
      },
    }),
    { 
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders 
      } 
    }
  );
};

const deleteTask = (taskId: string): Response => {
  const task = tasks.get(taskId);
  if (!task) {
    throw new APIError('not_found', 'Task not found', undefined, 404);
  }

  if (task.status === 'processing') {
    throw new APIError(
      'invalid_request',
      'Cannot delete a task that is currently processing',
      { status: task.status },
    );
  }

  tasks.delete(taskId);

  return new Response(
    JSON.stringify({
      success: true,
      message: 'Task deleted successfully',
    }),
    { 
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders 
      } 
    }
  );
};

// Main request handler
const handleRequest = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders,
    });
  }

  try {
    authenticate(req);

    const idempotentResponse = await handleIdempotency(req);
    if (idempotentResponse) return idempotentResponse;

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);

    if (pathParts[0] !== 'api' || pathParts[1] !== 'v1') {
      throw new APIError('not_found', 'Endpoint not found', undefined, 404);
    }

    switch (true) {
      case req.method === 'POST' && pathParts[2] === 'tasks':
        return await createTask(req);
      case req.method === 'GET' && pathParts[2] === 'tasks' && pathParts[4] === 'status':
        return getTaskStatus(pathParts[3]);
      case req.method === 'GET' && pathParts[2] === 'tasks' && pathParts[4] === 'implementation':
        return getTaskImplementation(pathParts[3]);
      case req.method === 'PUT' && pathParts[2] === 'tasks' && pathParts.length === 3:
        return await updateTask(req, pathParts[3]);
      case req.method === 'DELETE' && pathParts[2] === 'tasks' && pathParts.length === 3:
        return deleteTask(pathParts[3]);
      default:
        throw new APIError('not_found', 'Endpoint not found', undefined, 404);
    }
  } catch (error) {
    const status = error instanceof APIError ? error.status : 500;
    const errorResponse = {
      success: false,
      error: {
        code: error instanceof APIError ? error.code : 'server_error',
        message: error.message,
        details: error instanceof APIError ? error.details : undefined,
      },
    };

    return new Response(
      JSON.stringify(errorResponse),
      {
        status,
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders 
        },
      }
    );
  }
};

serve(handleRequest);