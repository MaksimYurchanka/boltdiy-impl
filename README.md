# bolt.diy-impl

## Integration Layer for AI-AutoCoding-DAO
The critical bridge between orchestration and implementation environments.

[Report Bug](https://github.com/MaksimYurchanka/boltdiy-impl/issues) · [Request Feature](https://github.com/MaksimYurchanka/boltdiy-impl/issues)

## Overview

**bolt.diy-impl** is the Integration Layer (Layer 2) of the AI-AutoCoding-DAO four-layer architecture. It serves as the critical bridge between the Orchestration Layer (Layer 1) and the Implementation Environment (Layer 3), handling API communication, authentication, and data management.

### Purpose

The Integration Layer facilitates seamless communication between the strategic orchestration capabilities of Layer 1 and the execution environment of Layer 3, enabling the 5-7x token efficiency improvement that is the core value proposition of the AIACD system.

## Architecture Context

```
AI-AutoCoding-DAO Ecosystem
├── Layer 1: AIACD Core (Orchestration Layer)
│   ├── Task Analyzer
│   ├── Template Manager
│   ├── Token Tracker
│   ├── Quality Analyzer
│   ├── Metrics Dashboard
│   └── Integration Layer API Client
├── Layer 2: bolt.diy-impl (Integration Layer) ← THIS REPOSITORY
│   ├── API Endpoints
│   ├── Authentication System
│   ├── bolt.diy WSL Client
│   ├── Template Management
│   ├── Streaming Support
│   └── Token Metrics Service
├── Layer 3: bolt.diy-standalone (Implementation Environment)
│   ├── Full IDE Environment
│   ├── Web Container
│   ├── Code Execution Engine
│   ├── Error Detection
│   └── Deployment Pipeline
└── Layer 4: MetaGipsy (Interaction Analysis Layer)
    ├── Conversation Analyzer
    ├── Pattern Recognition
    ├── User Profiling
    └── Prediction Engine
```

## Key Features

- **RESTful API**: Comprehensive API endpoints for Layer 1 communication
- **Authentication System**: Secure API key authentication with rate limiting
- **bolt.diy WSL Client**: Communication with Layer 3 running in WSL
- **Template Management**: Storage and management of task templates
- **Streaming Support**: Real-time updates during task processing
- **Token Metrics Service**: Tracking and analysis of token usage efficiency
- **Supabase Integration**: Persistent data storage and authentication
- **File Operations**: Management of project files through storage buckets

## API Endpoints

The Integration Layer provides the following key API endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/tasks` | `POST` | Create a new task |
| `/api/v1/tasks/{id}/status` | `GET` | Check the status of a task |
| `/api/v1/tasks/{id}/implementation` | `GET` | Get the implementation result |
| `/api/v1/tasks/{id}` | `PUT` | Update a task |
| `/api/v1/tasks/{id}` | `DELETE` | Delete a task |
| `/api/v1/tasks/{id}/stream` | `GET` | Connect to task event stream |
| `/api/v1/templates` | `GET` | List all templates |
| `/api/v1/templates/{id}` | `GET` | Get a specific template |
| `/api/v1/templates` | `POST` | Create a new template |
| `/api/v1/templates/{id}` | `PUT` | Update a template |
| `/api/v1/templates/{id}` | `DELETE` | Delete a template |
| `/api/v1/metrics/efficiency` | `GET` | Get token efficiency metrics |
| `/api/v1/metrics/timeseries` | `GET` | Get time-series metrics |
| `/api/v1/metrics/trend` | `GET` | Get efficiency trend data |

For detailed API documentation, see the [API Reference](docs/api-reference.md).

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm
- Supabase account
- WSL (Windows Subsystem for Linux) for Layer 3
- bolt.diy-standalone running in WSL

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/MaksimYurchanka/boltdiy-impl.git
   cd boltdiy-impl
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   pnpm install
   ```

3. Set up Supabase:
   - Create a new Supabase project
   - Run the migrations from `supabase/migrations/`
   - Set up storage buckets as specified

4. Configure environment variables:
   ```bash
   cp .env.example .env
   ```
   
   Edit the `.env` file with your credentials:
   ```
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   ANTHROPIC_API_KEY=your_anthropic_api_key
   BOLT_DIY_URL=your_bolt_diy_url
   AIACD_API_KEY=your_aiacd_api_key
   ```

5. Deploy the Edge Function to Supabase:
   ```bash
   npm run deploy:functions
   ```

### Development

Run the development server:

```bash
npm run dev
```

This will start a local server at `http://localhost:5173` where you can test API endpoints.

### Testing

Run tests:

```bash
npm test
```

## Supabase Database Schema

The Integration Layer uses the following key database tables:

- `tasks`: Stores task details and implementation results
- `templates`: Stores task templates for different types
- `api_keys`: Manages authentication keys
- `metrics`: Stores token usage and efficiency metrics

For database schema details, see the migrations in `supabase/migrations/`.

## Authentication

All API endpoints require authentication using an API key:

```
Authorization: Bearer YOUR_API_KEY
```

API keys are stored in the `api_keys` table with hashed values for security.

## Token Metrics

The token metrics system provides comprehensive tracking of token usage efficiency:

- **Token Usage**: Tracks prompt, completion, and total tokens
- **Template Efficiency**: Measures efficiency gains from using templates
- **Time-series Analysis**: Tracks efficiency over time
- **Trend Visualization**: Provides data for dashboard visualizations

## Integration with Layer 3

The bolt.diy WSL Client communicates with Layer 3 (bolt.diy-standalone) running in WSL through:

- REST API communication for task submission
- File operations using Supabase Storage
- Streaming updates for real-time feedback

## Streaming Support

The streaming system provides real-time updates during task processing:

- Server-Sent Events (SSE) for one-way streaming
- Multiple event types for different update categories
- Connection management and reconnection handling
- Progress reporting and completion notifications

## Contributing

Contributions are welcome! Please check out our [Contributing Guide](CONTRIBUTING.md) for guidelines on how to proceed.

### Development Guidelines

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Install development dependencies: `npm install`
4. Make your changes
5. Run tests: `npm test`
6. Commit your changes: `git commit -m 'Add some amazing feature'`
7. Push to the branch: `git push origin feature/amazing-feature`
8. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgements

- [Supabase](https://supabase.io/) - Database and authentication
- [Claude Sonnet](https://www.anthropic.com/) - AI model for fallback implementation
- [AIACD Core](https://github.com/MaksimYurchanka/aiacd-source) - Orchestration Layer
