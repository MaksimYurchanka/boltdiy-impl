# API Reference

This document provides comprehensive documentation for the bolt.diy-impl REST API, which serves as the Integration Layer (Layer 2) of the AI-AutoCoding-DAO architecture.

## Base URL

```
https://your-supabase-project.functions.supabase.co/api/v1
```

## Authentication

All API endpoints require authentication using an API key in the Authorization header:

```
Authorization: Bearer YOUR_API_KEY
```

## Rate Limiting

The API implements rate limiting to prevent abuse:

- 60 requests per minute for most endpoints
- 120 requests per minute for status check endpoints
- If rate limit is exceeded, the API returns a 429 Too Many Requests status with a Retry-After header

## Common Response Format

All API responses follow a consistent format:

### Success Response

```json
{
  "success": true,
  "data": {
    // Response data varies by endpoint
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "error_code",
    "message": "Error message",
    "details": {
      // Additional error details (optional)
    }
  }
}
```

## Error Codes

| Code | Description |
|------|-------------|
| `invalid_request` | The request is malformed or missing required parameters |
| `authentication_error` | Authentication failed or API key is invalid |
| `not_found` | The requested resource was not found |
| `rate_limit_exceeded` | You have exceeded the rate limit |
| `database_error` | Error accessing the database |
| `bolt_diy_error` | Error communicating with bolt.diy (Layer 3) |
| `server_error` | Internal server error |

## API Endpoints

- [Task Management](#task-management)
- [Template Management](#template-management)
- [Token Metrics](#token-metrics)
- [API Key Management](#api-key-management)

## Task Management

### Create Task

Creates a new task for processing.

**Endpoint**: `POST /tasks`

**Request Body**:

```json
{
  "prompt": "Create a React button component with hover effects",
  "type": "ui",
  "complexity": "low",
  "context": {
    "framework": "react",
    "styling": "tailwind"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prompt` | string | Yes | Task description or prompt |
| `type` | string | No | Task type (ui, function, utility) |
| `complexity` | string | No | Task complexity (low, medium, high) |
| `context` | object | No | Additional context for the task |

**Response**:

```json
{
  "success": true,
  "taskId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "processing"
}
```

**Status Codes**:

- `201 Created`: Task successfully created
- `400 Bad Request`: Invalid request body
- `401 Unauthorized`: Authentication failed
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

### Get Task Status

Checks the status of a task.

**Endpoint**: `GET /tasks/{taskId}/status`

**Path Parameters**:

- `taskId`: The ID of the task to check

**Response**:

```json
{
  "success": true,
  "status": "processing",
  "progress": 45
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Task status (pending, processing, completed, failed) |
| `progress` | number | Progress percentage (0-100) if available |
| `error` | object | Error details if status is "failed" |

**Status Codes**:

- `200 OK`: Status retrieved successfully
- `401 Unauthorized`: Authentication failed
- `404 Not Found`: Task not found
- `500 Internal Server Error`: Server error

### Get Task Implementation

Retrieves the implementation result for a completed task.

**Endpoint**: `GET /tasks/{taskId}/implementation`

**Path Parameters**:

- `taskId`: The ID of the task

**Response**:

```json
{
  "success": true,
  "implementation": "function Button({ children, onClick }) {\n  return (\n    <button\n      className=\"px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600\"\n      onClick={onClick}\n    >\n      {children}\n    </button>\n  );\n}",
  "files": [
    {
      "name": "Button.jsx",
      "content": "export default Button;"
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `implementation` | string | The implementation code or content |
| `files` | array | Array of files if the implementation includes multiple files |

**Status Codes**:

- `200 OK`: Implementation retrieved successfully
- `401 Unauthorized`: Authentication failed
- `404 Not Found`: Task not found
- `400 Bad Request`: Implementation not available (task not completed)
- `500 Internal Server Error`: Server error

### Update Task

Updates an existing task.

**Endpoint**: `PUT /tasks/{taskId}`

**Path Parameters**:

- `taskId`: The ID of the task to update

**Request Body**:

```json
{
  "prompt": "Updated task description",
  "status": "processing",
  "context": {
    "additionalInfo": "value"
  }
}
```

**Response**:

```json
{
  "success": true,
  "message": "Task updated successfully"
}
```

**Status Codes**:

- `200 OK`: Task updated successfully
- `400 Bad Request`: Invalid request body
- `401 Unauthorized`: Authentication failed
- `404 Not Found`: Task not found
- `500 Internal Server Error`: Server error

### Delete Task

Deletes a task.

**Endpoint**: `DELETE /tasks/{taskId}`

**Path Parameters**:

- `taskId`: The ID of the task to delete

**Response**:

```json
{
  "success": true,
  "message": "Task deleted successfully"
}
```

**Status Codes**:

- `200 OK`: Task deleted successfully
- `401 Unauthorized`: Authentication failed
- `404 Not Found`: Task not found
- `400 Bad Request`: Cannot delete a processing task
- `500 Internal Server Error`: Server error

### Task Event Stream

Connects to a Server-Sent Events (SSE) stream for real-time task updates.

**Endpoint**: `GET /tasks/{taskId}/stream`

**Path Parameters**:

- `taskId`: The ID of the task to stream

**Headers**:

- `Accept: text/event-stream`: Required for SSE
- `Cache-Control: no-cache`: Recommended for SSE
- `Connection: keep-alive`: Recommended for SSE

**Events**:

| Event Type | Description | Data Format |
|------------|-------------|-------------|
| `connected` | Initial connection established | `{ "taskId": "string", "timestamp": "string" }` |
| `task.status` | Task status change | `{ "status": "string", "timestamp": "string" }` |
| `task.progress` | Task progress update | `{ "progress": number, "timestamp": "string" }` |
| `task.output` | New output available | `{ "content": "string", "timestamp": "string" }` |
| `task.completion` | Task completed | `{ "implementation": "string", "files": [...], "timestamp": "string" }` |
| `task.error` | Task error occurred | `{ "code": "string", "message": "string", "timestamp": "string" }` |
| `error` | Stream error | `{ "type": "string", "message": "string", "timestamp": "string" }` |

**Example Client Usage**:

```javascript
const eventSource = new EventSource('https://your-api-url.com/api/v1/tasks/task-123/stream', {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY'
  }
});

eventSource.addEventListener('connected', (event) => {
  const data = JSON.parse(event.data);
  console.log('Connected to stream for task:', data.taskId);
});

eventSource.addEventListener('task.status', (event) => {
  const data = JSON.parse(event.data);
  console.log(`Status updated: ${data.status}`);
});

eventSource.addEventListener('task.completion', (event) => {
  const data = JSON.parse(event.data);
  console.log('Task completed!');
  console.log('Implementation:', data.implementation);
  eventSource.close();
});

eventSource.addEventListener('error', (event) => {
  console.error('Stream error');
  eventSource.close();
});
```

**Status Codes**:

- `200 OK`: Stream established
- `401 Unauthorized`: Authentication failed
- `404 Not Found`: Task not found
- `500 Internal Server Error`: Server error

## Template Management

### List Templates

Retrieves all templates, optionally filtered by type.

**Endpoint**: `GET /templates`

**Query Parameters**:

- `type` (optional): Filter templates by type

**Response**:

```json
{
  "success": true,
  "data": [
    {
      "id": "template-123",
      "name": "React Button",
      "type": "ui",
      "content": "# Button Component\n\n{description}\n\n## Props\n{props}",
      "created_at": "2025-03-10T15:30:00Z",
      "updated_at": "2025-03-10T15:30:00Z"
    },
    // More templates...
  ]
}
```

**Status Codes**:

- `200 OK`: Templates retrieved successfully
- `401 Unauthorized`: Authentication failed
- `500 Internal Server Error`: Server error

### Get Template

Retrieves a specific template by ID.

**Endpoint**: `GET /templates/{id}`

**Path Parameters**:

- `id`: Template ID

**Response**:

```json
{
  "success": true,
  "data": {
    "id": "template-123",
    "name": "React Button",
    "type": "ui",
    "content": "# Button Component\n\n{description}\n\n## Props\n{props}",
    "created_at": "2025-03-10T15:30:00Z",
    "updated_at": "2025-03-10T15:30:00Z"
  }
}
```

**Status Codes**:

- `200 OK`: Template retrieved successfully
- `401 Unauthorized`: Authentication failed
- `404 Not Found`: Template not found
- `500 Internal Server Error`: Server error

### Create Template

Creates a new template.

**Endpoint**: `POST /templates`

**Request Body**:

```json
{
  "name": "React Button",
  "type": "ui",
  "content": "# Button Component\n\n{description}\n\n## Props\n{props}",
  "metadata": {
    "version": "1.0",
    "complexity": "low"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Template name |
| `type` | string | Yes | Template type |
| `content` | string | Yes | Template content |
| `metadata` | object | No | Additional metadata |

**Response**:

```json
{
  "success": true,
  "data": {
    "id": "template-123",
    "name": "React Button",
    "type": "ui",
    "content": "# Button Component\n\n{description}\n\n## Props\n{props}",
    "created_at": "2025-03-10T15:30:00Z",
    "updated_at": "2025-03-10T15:30:00Z"
  }
}
```

**Status Codes**:

- `201 Created`: Template created successfully
- `400 Bad Request`: Invalid request body
- `401 Unauthorized`: Authentication failed
- `500 Internal Server Error`: Server error

### Update Template

Updates an existing template.

**Endpoint**: `PUT /templates/{id}`

**Path Parameters**:

- `id`: Template ID

**Request Body**:

```json
{
  "name": "Updated React Button",
  "type": "ui",
  "content": "# Updated Button Component\n\n{description}\n\n## Props\n{props}"
}
```

**Response**:

```json
{
  "success": true,
  "data": {
    "id": "template-123",
    "name": "Updated React Button",
    "type": "ui",
    "content": "# Updated Button Component\n\n{description}\n\n## Props\n{props}",
    "created_at": "2025-03-10T15:30:00Z",
    "updated_at": "2025-03-10T16:45:00Z"
  }
}
```

**Status Codes**:

- `200 OK`: Template updated successfully
- `400 Bad Request`: Invalid request body
- `401 Unauthorized`: Authentication failed
- `404 Not Found`: Template not found
- `500 Internal Server Error`: Server error

### Delete Template

Deletes a template.

**Endpoint**: `DELETE /templates/{id}`

**Path Parameters**:

- `id`: Template ID

**Response**:

```json
{
  "success": true,
  "message": "Template deleted successfully"
}
```

**Status Codes**:

- `200 OK`: Template deleted successfully
- `401 Unauthorized`: Authentication failed
- `404 Not Found`: Template not found
- `500 Internal Server Error`: Server error

## Token Metrics

### Get Efficiency Metrics

Retrieves token efficiency metrics, optionally filtered by template type and date range.

**Endpoint**: `GET /metrics/efficiency`

**Query Parameters**:

- `type` (optional): Filter by template type
- `start` (optional): Start date in ISO format
- `end` (optional): End date in ISO format

**Response**:

```json
{
  "success": true,
  "data": [
    {
      "templateId": "template-123",
      "templateName": "React Button",
      "templateType": "ui",
      "avgTokens": 350,
      "minTokens": 250,
      "maxTokens": 450,
      "usageCount": 15,
      "efficiencyRatio": 5.7,
      "calculatedAt": "2025-03-10T15:30:00Z"
    },
    // More metrics...
  ]
}
```

**Status Codes**:

- `200 OK`: Metrics retrieved successfully
- `401 Unauthorized`: Authentication failed
- `500 Internal Server Error`: Server error

### Get Timeseries Metrics

Retrieves time-series metrics for token usage.

**Endpoint**: `GET /metrics/timeseries`

**Query Parameters**:

- `start`: Start date in ISO format (required)
- `end`: End date in ISO format (required)
- `type` (optional): Filter by task type

**Response**:

```json
{
  "success": true,
  "data": [
    {
      "day": "2025-03-10T00:00:00Z",
      "taskType": "ui",
      "taskCount": 5,
      "avgTokens": 320,
      "totalTokens": 1600,
      "templatesUsed": 2,
      "dayOverDayEfficiency": 1.05
    },
    // More data points...
  ]
}
```

**Status Codes**:

- `200 OK`: Metrics retrieved successfully
- `400 Bad Request`: Missing required parameters
- `401 Unauthorized`: Authentication failed
- `500 Internal Server Error`: Server error

### Get Efficiency Trend

Retrieves token efficiency trend data.

**Endpoint**: `GET /metrics/trend`

**Query Parameters**:

- `days`: Number of days to include (default: 30)
- `type` (optional): Filter by task type

**Response**:

```json
{
  "success": true,
  "data": [
    {
      "date": "2025-02-10T00:00:00Z",
      "efficiency": 4.8
    },
    {
      "date": "2025-02-11T00:00:00Z",
      "efficiency": 4.9
    },
    // More data points...
    {
      "date": "2025-03-10T00:00:00Z",
      "efficiency": 5.7
    }
  ]
}
```

**Status Codes**:

- `200 OK`: Trend data retrieved successfully
- `401 Unauthorized`: Authentication failed
- `500 Internal Server Error`: Server error

## API Key Management

### Create API Key

Creates a new API key.

**Endpoint**: `POST /api-keys`

**Request Body**:

```json
{
  "name": "Layer 1 Integration Key",
  "userId": "user-123",
  "expiresAt": "2026-03-10T00:00:00Z"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Name for the API key |
| `userId` | string | No | User ID to associate with the key |
| `expiresAt` | string | No | Expiration date in ISO format |

**Response**:

```json
{
  "success": true,
  "apiKey": "sk_test_abcdefghijklmnopqrstuvwxyz",
  "data": {
    "id": "key-123",
    "name": "Layer 1 Integration Key",
    "created_at": "2025-03-10T15:30:00Z",
    "expires_at": "2026-03-10T00:00:00Z"
  }
}
```

**Status Codes**:

- `201 Created`: API key created successfully
- `400 Bad Request`: Invalid request body
- `401 Unauthorized`: Authentication failed
- `500 Internal Server Error`: Server error

### List API Keys

Lists API keys for a user.

**Endpoint**: `GET /api-keys`

**Query Parameters**:

- `userId`: User ID (required)

**Response**:

```json
{
  "success": true,
  "data": [
    {
      "id": "key-123",
      "name": "Layer 1 Integration Key",
      "created_at": "2025-03-10T15:30:00Z",
      "expires_at": "2026-03-10T00:00:00Z",
      "last_used_at": "2025-03-10T16:45:00Z"
    },
    // More API keys...
  ]
}
```

**Status Codes**:

- `200 OK`: API keys retrieved successfully
- `400 Bad Request`: Missing required parameters
- `401 Unauthorized`: Authentication failed
- `500 Internal Server Error`: Server error

### Revoke API Key

Revokes (deletes) an API key.

**Endpoint**: `DELETE /api-keys`

**Query Parameters**:

- `keyId`: API key ID (required)

**Response**:

```json
{
  "success": true,
  "message": "API key revoked successfully"
}
```

**Status Codes**:

- `200 OK`: API key revoked successfully
- `400 Bad Request`: Missing required parameters
- `401 Unauthorized`: Authentication failed
- `404 Not Found`: API key not found
- `500 Internal Server Error`: Server error
