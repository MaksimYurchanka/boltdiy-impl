import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "npm:zod@3.22.4";
import { v4 as uuidv4 } from "npm:uuid@9.0.1";
import { Anthropic } from "npm:@anthropic-ai/sdk@0.18.0";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";

// Initialize Supabase client
const supabaseClient = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
);

// Initialize bolt.diy client
const boltDiyClient = {
  baseUrl: Deno.env.get("BOLT_DIY_URL") || "http://localhost:5173",
  timeout: 30000,
  retries: 3,
  retryDelay: 1000,
};

// Initialize file manager
const fileManager = {
  supabase: supabaseClient,
  bucketName: "project-files",
};

// Initialize event publisher
const eventPublisher = new EventPublisher();

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

const apiKeySchema = z.object({
  name: z.string().min(1, "Name is required"),
  userId: z.string().uuid().optional(),
  expiresAt: z.string().datetime().optional(),
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
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
};

// Rate limiting class
class RateLimiter {
  private readonly MAX_REQUESTS = 60; // Max requests per window
  private readonly WINDOW_MS = 60 * 1000; // 1 minute window
  
  async check(identifier: string): Promise<boolean> {
    const now = new Date();
    const windowStart = new Date(now.getTime() - this.WINDOW_MS);
    
    const { count, error } = await supabaseClient
      .from("metrics")
      .select("*", { count: "exact", head: true })
      .eq("metric_type", "rate_limit")
      .gte("timestamp", windowStart.toISOString())
      .eq("value->identifier", identifier);
    
    if (error) {
      console.error("Rate limit check error:", error);
      return true; // Allow request if we can't check the limit
    }
    
    if (count < this.MAX_REQUESTS) {
      await supabaseClient
        .from("metrics")
        .insert({
          metric_type: "rate_limit",
          value: { identifier, timestamp: now.toISOString() }
        });
      return true;
    }
    
    return false;
  }
  
  async getRetryAfter(identifier: string): Promise<number> {
    const { data, error } = await supabaseClient
      .from("metrics")
      .select("timestamp")
      .eq("metric_type", "rate_limit")
      .eq("value->identifier", identifier)
      .order("timestamp", { ascending: true })
      .limit(1);
    
    if (error || !data || data.length === 0) return 60;
    
    const oldestTimestamp = new Date(data[0].timestamp);
    const resetTime = new Date(oldestTimestamp.getTime() + this.WINDOW_MS);
    const now = new Date();
    
    return Math.max(0, Math.ceil((resetTime.getTime() - now.getTime()) / 1000));
  }
}

const rateLimiter = new RateLimiter();

// API Key validation
const validateApiKey = async (apiKey: string): Promise<boolean> => {
  const keyHash = apiKey; // In production, hash the key first
  
  const { data, error } = await supabaseClient
    .from("api_keys")
    .select("id, expires_at")
    .eq("key_hash", keyHash)
    .single();
  
  if (error || !data) return false;
  
  if (data.expires_at && new Date(data.expires_at) < new Date()) return false;
  
  await supabaseClient
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);
  
  return true;
};

// Middleware
const authenticate = async (req: Request): Promise<void> => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new APIError("authentication_error", "Invalid authentication token", undefined, 401);
  }
  
  const token = authHeader.substring(7);
  const isValid = await validateApiKey(token);
  
  if (!isValid) {
    throw new APIError("authentication_error", "Invalid API key", undefined, 403);
  }
};

const checkRateLimit = async (req: Request): Promise<void> => {
  const identifier = req.headers.get("X-Forwarded-For") || 
                    req.headers.get("Authorization")?.substring(7) || 
                    "unknown";
  
  if (!await rateLimiter.check(identifier)) {
    const retryAfter = await rateLimiter.getRetryAfter(identifier);
    throw new APIError(
      "rate_limit_exceeded",
      "Rate limit exceeded",
      { retryAfter },
      429
    );
  }
};

// API Key management endpoints
const createApiKey = async (req: Request): Promise<Response> => {
  const body = await req.json();
  const validatedData = apiKeySchema.parse(body);
  
  const apiKey = crypto.randomUUID();
  const keyHash = apiKey; // In production, hash the key
  
  const { data, error } = await supabaseClient
    .from("api_keys")
    .insert({
      key_hash: keyHash,
      name: validatedData.name,
      user_id: validatedData.userId || null,
      expires_at: validatedData.expiresAt || null
    })
    .select()
    .single();
  
  if (error) {
    throw new APIError("database_error", "Failed to create API key", { error: error.message });
  }
  
  return new Response(
    JSON.stringify({
      success: true,
      apiKey: apiKey,
      data: {
        id: data.id,
        name: data.name,
        created_at: data.created_at,
        expires_at: data.expires_at
      }
    }),
    { headers: { "Content-Type": "application/json", ...corsHeaders } }
  );
};

const listApiKeys = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  
  if (!userId) {
    throw new APIError("invalid_request", "User ID is required");
  }
  
  const { data, error } = await supabaseClient
    .from("api_keys")
    .select("id, name, created_at, expires_at, last_used_at")
    .eq("user_id", userId);
  
  if (error) {
    throw new APIError("database_error", "Failed to list API keys", { error: error.message });
  }
  
  return new Response(
    JSON.stringify({
      success: true,
      data
    }),
    { headers: { "Content-Type": "application/json", ...corsHeaders } }
  );
};

const revokeApiKey = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const keyId = url.searchParams.get("keyId");
  
  if (!keyId) {
    throw new APIError("invalid_request", "Key ID is required");
  }
  
  const { error } = await supabaseClient
    .from("api_keys")
    .delete()
    .eq("id", keyId);
  
  if (error) {
    throw new APIError("database_error", "Failed to revoke API key", { error: error.message });
  }
  
  return new Response(
    JSON.stringify({
      success: true,
      message: "API key revoked successfully"
    }),
    { headers: { "Content-Type": "application/json", ...corsHeaders } }
  );
};

// Route handlers
const createTask = async (req: Request): Promise<Response> => {
  const body = await req.json();
  const validatedData = taskSchema.parse(body);

  const taskId = uuidv4();
  
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

  try {
    // Try bolt.diy first
    const boltDiyResponse = await fetch(`${boltDiyClient.baseUrl}/api/implementation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: validatedData.prompt,
        context: validatedData.context,
      }),
    });

    if (boltDiyResponse.ok) {
      const { error: updateError } = await supabaseClient
        .from("tasks")
        .update({
          status: "processing",
        })
        .eq("id", taskId);

      if (updateError) {
        throw new APIError("database_error", "Failed to update task", { error: updateError.message });
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          taskId,
          status: "processing",
        }),
        { 
          headers: { 
            "Content-Type": "application/json",
            ...corsHeaders,
          },
        }
      );
    }

    // Fallback to Claude if bolt.diy is not available
    const anthropic = new Anthropic({
      apiKey: Deno.env.get("ANTHROPIC_API_KEY") || "",
    });

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
    const { error: updateError } = await supabaseClient
      .from("tasks")
      .update({
        status: "failed",
        error: {
          code: "processing_error",
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

  if (task.status === "processing") {
    try {
      const boltDiyResponse = await fetch(
        `${boltDiyClient.baseUrl}/api/implementation/${taskId}/status`
      );
      if (boltDiyResponse.ok) {
        const boltDiyStatus = await boltDiyResponse.json();
        return new Response(
          JSON.stringify({
            success: true,
            status: boltDiyStatus.status,
            progress: boltDiyStatus.progress,
          }),
          { 
            headers: { 
              "Content-Type": "application/json",
              ...corsHeaders,
            },
          }
        );
      }
    } catch (error) {
      console.error("Failed to fetch bolt.diy status:", error);
    }
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

  // Try to get implementation from bolt.diy first
  try {
    const boltDiyResponse = await fetch(
      `${boltDiyClient.baseUrl}/api/implementation/${taskId}`
    );
    if (boltDiyResponse.ok) {
      const boltDiyImplementation = await boltDiyResponse.json();
      return new Response(
        JSON.stringify({
          success: true,
          implementation: boltDiyImplementation.implementation,
          files: boltDiyImplementation.files,
        }),
        { 
          headers: { 
            "Content-Type": "application/json",
            ...corsHeaders,
          },
        }
      );
    }
  } catch (error) {
    console.error("Failed to fetch bolt.diy implementation:", error);
  }

  // Fallback to database implementation
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

// Add new streaming endpoint
const streamTaskUpdates = async (req: Request, taskId: string): Promise<Response> => {
  // Validate task exists
  const { data: task, error } = await supabaseClient
    .from("tasks")
    .select("status")
    .eq("id", taskId)
    .single();

  if (error || !task) {
    throw new APIError("not_found", "Task not found", undefined, 404);
  }

  // Create streaming response
  const stream = new ReadableStream({
    start(controller) {
      // Store connection in active connections map
      const connectionId = crypto.randomUUID();
      eventPublisher.subscribe(taskId, connectionId, controller);

      // Send initial message
      const initialEvent = {
        type: "connected",
        data: { taskId },
        timestamp: new Date().toISOString(),
      };
      eventPublisher.publish(taskId, initialEvent);

      // Set up cleanup on client disconnect
      req.signal.addEventListener("abort", () => {
        eventPublisher.unsubscribe(taskId, connectionId);
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      ...corsHeaders,
    },
  });
};

// Main request handler
const handleRequest = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders,
    });
  }

  try {
    await authenticate(req);
    await checkRateLimit(req);

    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);

    if (pathParts[0] !== "api" || pathParts[1] !== "v1") {
      throw new APIError("not_found", "Endpoint not found", undefined, 404);
    }

    // Add new route for streaming
    if (req.method === "GET" && pathParts[2] === "tasks" && pathParts[4] === "stream") {
      return await streamTaskUpdates(req, pathParts[3]);
    }

    const responseHeaders = {
      ...corsHeaders,
      "Content-Type": "application/json",
      "X-API-Version": "v1",
    };

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
      case req.method === "POST" && pathParts[2] === "api-keys":
        return await createApiKey(req);
      case req.method === "GET" && pathParts[2] === "api-keys":
        return await listApiKeys(req);
      case req.method === "DELETE" && pathParts[2] === "api-keys":
        return await revokeApiKey(req);
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