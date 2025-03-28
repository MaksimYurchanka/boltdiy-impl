import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "npm:zod@3.22.4";
import { v4 as uuidv4 } from "npm:uuid@9.0.1";
import { Anthropic } from "npm:@anthropic-ai/sdk@0.18.0";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";

// Initialize Supabase client
const supabaseClient = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
);

// Validation schemas
const taskSchema = z.object({
  prompt: z.string().min(1, "Prompt cannot be empty"),
  context: z.string().optional(),
});

const taskUpdateSchema = z.object({
  prompt: z.string().min(1).optional(),
  context: z.string().optional(),
  status: z.enum(["pending", "processing", "completed", "failed"]).optional(),
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
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Idempotency-Key",
};

// Middleware
const authenticate = (req: Request): void => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new APIError("authentication_error", "Invalid authentication token", undefined, 401);
  }
  // TODO: Implement proper token validation
};

// Route handlers
const createTask = async (req: Request): Promise<Response> => {
  const body = await req.json();
  const validatedData = taskSchema.parse(body);

  const taskId = uuidv4();
  
  // Create task in Supabase
  const { error: insertError } = await supabaseClient
    .from("tasks")
    .insert({
      id: taskId,
      status: "pending",
      prompt: validatedData.prompt,
      context: validatedData.context,
    });

  if (insertError) {
    throw new APIError("database_error", "Failed to create task", { error: insertError.message });
  }

  // Initialize Claude API client
  const anthropic = new Anthropic({
    apiKey: Deno.env.get("ANTHROPIC_API_KEY") || "",
  });

  try {
    const completion = await anthropic.messages.create({
      model: "claude-3-opus-20240229",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: validatedData.prompt,
        },
      ],
    });

    const tokenUsage = {
      prompt: completion.usage?.input_tokens || 0,
      completion: completion.usage?.output_tokens || 0,
      total: (completion.usage?.input_tokens || 0) + (completion.usage?.output_tokens || 0),
    };

    // Update task with implementation and token usage
    const { error: updateError } = await supabaseClient
      .from("tasks")
      .update({
        implementation: completion.content[0].text,
        status: "completed",
        token_usage: tokenUsage,
      })
      .eq("id", taskId);

    if (updateError) {
      throw new APIError("database_error", "Failed to update task", { error: updateError.message });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        taskId,
        status: "completed",
      }),
      { 
        headers: { 
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  } catch (error) {
    // Update task with error status
    const { error: updateError } = await supabaseClient
      .from("tasks")
      .update({
        status: "failed",
        error: {
          code: "claude_api_error",
          message: error.message,
        },
      })
      .eq("id", taskId);

    if (updateError) {
      console.error("Failed to update task error status:", updateError);
    }

    throw new APIError("server_error", "Failed to process task", { error: error.message });
  }
};

const getTaskStatus = async (taskId: string): Promise<Response> => {
  const { data: task, error } = await supabaseClient
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .single();

  if (error) {
    throw new APIError("database_error", "Failed to fetch task", { error: error.message });
  }

  if (!task) {
    throw new APIError("not_found", "Task not found", undefined, 404);
  }

  return new Response(
    JSON.stringify({
      success: true,
      status: task.status,
      error: task.error,
    }),
    { 
      headers: { 
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    }
  );
};

const getTaskImplementation = async (taskId: string): Promise<Response> => {
  const { data: task, error } = await supabaseClient
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .single();

  if (error) {
    throw new APIError("database_error", "Failed to fetch task", { error: error.message });
  }

  if (!task) {
    throw new APIError("not_found", "Task not found", undefined, 404);
  }

  if (task.status !== "completed") {
    throw new APIError(
      "invalid_request",
      "Implementation not available",
      { status: task.status },
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      implementation: task.implementation,
      status: task.status,
    }),
    { 
      headers: { 
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    }
  );
};

const updateTask = async (req: Request, taskId: string): Promise<Response> => {
  const { data: existingTask, error: fetchError } = await supabaseClient
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .single();

  if (fetchError || !existingTask) {
    throw new APIError("not_found", "Task not found", undefined, 404);
  }

  const body = await req.json();
  const validatedData = taskUpdateSchema.parse(body);

  const { error: updateError } = await supabaseClient
    .from("tasks")
    .update({
      ...validatedData,
    })
    .eq("id", taskId);

  if (updateError) {
    throw new APIError("database_error", "Failed to update task", { error: updateError.message });
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: "Task updated successfully",
    }),
    { 
      headers: { 
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    }
  );
};

const deleteTask = async (taskId: string): Promise<Response> => {
  const { data: task, error: fetchError } = await supabaseClient
    .from("tasks")
    .select("status")
    .eq("id", taskId)
    .single();

  if (fetchError || !task) {
    throw new APIError("not_found", "Task not found", undefined, 404);
  }

  if (task.status === "processing") {
    throw new APIError(
      "invalid_request",
      "Cannot delete a task that is currently processing",
      { status: task.status },
    );
  }

  const { error: deleteError } = await supabaseClient
    .from("tasks")
    .delete()
    .eq("id", taskId);

  if (deleteError) {
    throw new APIError("database_error", "Failed to delete task", { error: deleteError.message });
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: "Task deleted successfully",
    }),
    { 
      headers: { 
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    }
  );
};

// Main request handler
const handleRequest = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders,
    });
  }

  try {
    authenticate(req);

    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);

    if (pathParts[0] !== "api" || pathParts[1] !== "v1") {
      throw new APIError("not_found", "Endpoint not found", undefined, 404);
    }

    switch (true) {
      case req.method === "POST" && pathParts[2] === "tasks":
        return await createTask(req);
      case req.method === "GET" && pathParts[2] === "tasks" && pathParts[4] === "status":
        return await getTaskStatus(pathParts[3]);
      case req.method === "GET" && pathParts[2] === "tasks" && pathParts[4] === "implementation":
        return await getTaskImplementation(pathParts[3]);
      case req.method === "PUT" && pathParts[2] === "tasks" && pathParts.length === 3:
        return await updateTask(req, pathParts[3]);
      case req.method === "DELETE" && pathParts[2] === "tasks" && pathParts.length === 3:
        return await deleteTask(pathParts[3]);
      default:
        throw new APIError("not_found", "Endpoint not found", undefined, 404);
    }
  } catch (error) {
    const status = error instanceof APIError ? error.status : 500;
    const errorResponse = {
      success: false,
      error: {
        code: error instanceof APIError ? error.code : "server_error",
        message: error.message,
        details: error instanceof APIError ? error.details : undefined,
      },
    };

    return new Response(
      JSON.stringify(errorResponse),
      {
        status,
        headers: { 
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  }
};

serve(handleRequest);