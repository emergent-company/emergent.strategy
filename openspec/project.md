# Project Context

## Purpose

Spec Server is a minimal ingestion and knowledge management system that provides:

- Document ingestion from URLs and file uploads with text extraction and chunking
- Semantic search using Google Gemini embeddings (text-embedding-004) with pgvector
- Full-text search capabilities with PostgreSQL
- AI-powered chat with LangChain integration
- Graph-based knowledge management with objects, relationships, and template packs
- Schema-aware chat using Model Context Protocol (MCP) for real-time database queries
- OAuth 2.0/OIDC authentication via Zitadel with fine-grained scope-based authorization

## Tech Stack

### Backend

- **Runtime:** Node.js 20.19.0+
- **Framework:** NestJS 10.3.0 (TypeScript)
- **Database:** PostgreSQL 16 with pgvector extension
- **ORM:** TypeORM 0.3.27
- **Authentication:** Passport.js with Zitadel OIDC (passport-zitadel)
- **AI/ML:** LangChain, Google Gemini (text-embedding-004), Vertex AI
- **API Documentation:** Swagger/OpenAPI 3.0
- **MCP:** @rekog/mcp-nest for Model Context Protocol integration

### Frontend

- **Framework:** React 19.1.1 with TypeScript
- **Build Tool:** Vite 7.0.6
- **Routing:** React Router 7.7.1
- **Styling:** Tailwind CSS 4.1.11, DaisyUI 5.0.50
- **UI Components:** TanStack Table, ApexCharts, Quill, FilePond
- **Testing:** Vitest, Playwright, Testing Library

### DevOps & Tooling

- **Monorepo:** Nx 21.6.5 workspace
- **Package Manager:** npm (workspaces)
- **Process Management:** PM2 (via workspace-cli)
- **Containerization:** Docker Compose
- **Deployment:** Docker Compose with Traefik proxy
- **Git Hooks:** Husky 9.1.7

### Development Tools

- **TypeScript:** 5.5.4+ (strict mode enabled)
- **Formatting:** Prettier 2.6.2 with `singleQuote: true`
- **Linting:** ESLint 9.32.0
- **Testing:** Vitest 3.2.4, Playwright 1.48.2
- **Documentation:** Storybook 9.1.13

## Project Conventions

### Code Style

- **Formatting:** Prettier with `singleQuote: true`. Run `npx prettier --write .` to format all files.
- **Imports:** Use ES6 module imports exclusively. Sort imports using @trivago/prettier-plugin-sort-imports.
- **Types:** TypeScript in strict mode (`strict: true`). No implicit any, proper null checks.
- **Naming Conventions:**
  - `camelCase` for variables, functions, and methods
  - `PascalCase` for classes, interfaces, types, and React components
  - `kebab-case` for file names and directory names
  - `UPPER_SNAKE_CASE` for constants and environment variables
- **Error Handling:**
  - Handle errors gracefully with meaningful error messages
  - Use NestJS exception filters for API errors
  - Log errors with full context (user/org/project IDs, stack traces)
- **Comments:** Use JSDoc for public APIs, inline comments for complex logic only
- **General:** Follow existing patterns in the codebase. When in doubt, match nearby code.

### Architecture Patterns

#### Monorepo Structure

- **apps/admin**: React frontend SPA (Vite + React Router)
- **apps/server**: NestJS backend API
- **tools/workspace-cli**: PM2-based process management and lifecycle automation
- **scripts/**: Shared automation scripts (database, deployment, testing)
- **docs/**: Comprehensive documentation organized by category

#### Backend Architecture (NestJS)

- **Modular design:** Feature modules (documents, chat, extraction-jobs, monitoring, etc.)
- **Layered architecture:** Controllers → Services → Repositories (TypeORM entities)
- **DTOs:** Use class-validator and class-transformer for request/response validation
- **Guards:** JWT authentication with scope-based authorization (@Scopes decorator)
- **Entities:** TypeORM entities with proper relations, indexes, and constraints
- **Database migrations:** TypeORM migrations in `src/migrations/`

#### Frontend Architecture (React)

- **Context providers:** Auth, Config, Organizations, Projects
- **Custom hooks:** useApi, useChat, useSSE, useLocalStorage, useOrganizations, useProjects
- **Component organization:** Flat structure in src/ with logical grouping (pages/, hooks/, contexts/, services/)
- **Styling:** Tailwind utility classes, DaisyUI components, custom CSS for complex layouts
- **State management:** React Context + local state, no Redux/Zustand
- **API communication:** Fetch API wrapped in useApi hook with automatic token injection

#### Database Patterns

- **Graph model:** Objects (graph_objects), Relationships (graph_relationships), Template Packs
- **Embeddings:** Stored as pgvector vectors with configurable dimensions
- **Full-text search:** PostgreSQL ts_vector with lexical + semantic fusion
- **Migrations:** Run automatically via workspace-cli or manually with TypeORM CLI
- **Cursor pagination:** Bidirectional, opaque Base64URL cursors for hybrid search results

#### Authentication & Authorization

- **OAuth 2.0/OIDC:** Zitadel-hosted UI for login flows
- **JWT tokens:** Bearer tokens with introspection caching
- **Scopes:** Fine-grained permissions (read:me, documents:read, documents:write, chat:read, chat:write, schema:read, etc.)
- **Error shape:** `403` with `{ error: { code: "forbidden", message: "Forbidden", missing_scopes: [...] } }`
- **Service accounts:** Dual service account pattern for bootstrap and runtime operations

### Testing Strategy

#### Backend Tests (NestJS)

- **Unit tests:** Vitest for services, with in-memory FakeGraphDb helper for graph logic
- **E2E tests:** Supertest for HTTP endpoints, real PostgreSQL database
- **Test helpers:** `tests/helpers/fake-graph-db.ts` for graph emulation, mock auth providers
- **Coverage targets:** Run `npm run test:coverage:all` for combined coverage reports
- **Benchmark tests:** Performance tests for graph operations (relationships, objects, traversal)

#### Frontend Tests (React)

- **Unit tests:** Vitest + Testing Library for components and hooks
- **E2E tests:** Playwright with fixtures for auth, navigation, assertions
- **Visual tests:** Storybook stories with a11y addon
- **Test isolation:** Each E2E test uses fresh auth state, cleanup between runs
- **Real vs Mock:** E2E tests support `E2E_REAL_LOGIN=1` for real Zitadel auth

#### Test Commands

```bash
# Backend
nx run server:test              # Unit tests
nx run server:test-e2e          # E2E tests
nx run server:test-coverage     # Coverage report

# Frontend
nx run admin:test                    # Unit tests
nx run admin:e2e                     # Playwright E2E
nx run admin:test-coverage           # Coverage report

# Combined
npm run test:coverage:all            # All coverage reports
```

**Test Development with DevTools MCP:**

When writing E2E or integration tests, use Chrome DevTools MCP to verify functionality before writing tests:

- Get test credentials: `./scripts/get-test-user-credentials.sh`
- Start Chrome debug: `npm run chrome:debug`
- Manually verify functionality and gather selectors
- See `openspec/AGENTS.md` Stage 2 for detailed workflow

### Git Workflow

#### Branch Strategy

- **Main branch:** `master` (production-ready)
- **Feature branches:** `feature/description` or `add-feature-name`
- **Fix branches:** `fix/issue-description`
- **Change branches:** When using OpenSpec proposals, branch name matches change-id

#### Commit Conventions

- Use clear, concise commit messages (1-2 sentences)
- Focus on "why" rather than "what"
- Prefix with scope when helpful: `auth:`, `chat:`, `docs:`, `fix:`
- Examples:
  - `auth: add two-factor authentication support`
  - `chat: fix MCP schema query timeout handling`
  - `docs: update deployment guide for Coolify`

#### Pre-commit Hooks

- **Husky:** Runs validation on commit
- **Story validation:** Checks for duplicate Storybook stories
- **Formatting:** Prettier runs automatically (configure IDE to format on save)

#### Pull Requests

- Use PR template in `.github/pull_request_template.md`
- Include summary, testing notes, and breaking changes
- Link to related issues or OpenSpec proposals
- Ensure CI passes (tests, lint, build)

## Domain Context

### Knowledge Graph Model

- **Objects:** Typed entities (Requirements, Decisions, Issues, Tasks, Constraints) with properties
- **Relationships:** Directed edges between objects with metadata (created_at, relationship_type)
- **Template Packs:** Pre-defined schemas for common patterns (Meeting Decisions, TOGAF, Emergent Framework)
- **Versioning:** Objects support version history with branch/merge provenance tracking

### Ingestion & Embedding Pipeline

1. **Input:** URL or file upload
2. **Extraction:** HTML-to-text or direct text extraction
3. **Chunking:** Semantic chunking with LangChain RecursiveCharacterTextSplitter
4. **Embedding:** Google Gemini text-embedding-004 (768 dimensions)
5. **Storage:** Chunks + embeddings in PostgreSQL with pgvector indexes

### Search & Retrieval

- **Semantic search:** Cosine similarity on embeddings (pgvector)
- **Lexical search:** Full-text search with PostgreSQL ts_vector
- **Hybrid fusion:** Combined semantic + lexical results with rank normalization
- **Pagination:** Bidirectional cursor-based pagination for stable results

### Chat System

- **Conversations:** Multi-turn chat with message history
- **Streaming:** Server-sent events (SSE) for real-time responses
- **Context augmentation:** Graph search results injected into LLM prompts
- **MCP integration:** Automatic schema queries for database-related questions
- **Providers:** Google Gemini, Vertex AI (configurable)

### MCP (Model Context Protocol)

- **Purpose:** Provide AI agents with structured access to the knowledge graph
- **Tools:** schema_version, schema_changelog, type_info (data tools future)
- **Authentication:** JWT bearer tokens with `schema:read` scope
- **Integration:** Automatic detection of schema queries in chat, tool invocation, context injection

## Important Constraints

### Technical Constraints

- **Node.js version:** Minimum 20.19.0 (use nvm or asdf to manage)
- **PostgreSQL version:** 16+ required for pgvector extension
- **pgvector extension:** Must be installed for embedding storage
- **Embedding dimensions:** 768 (Google Gemini text-embedding-004), migrations required if changing
- **API rate limits:** Google Gemini API has rate limits, implement backoff strategies
- **Memory usage:** Large document ingestion can consume significant memory, consider chunking
- **Database connections:** Limit concurrent connections, use connection pooling

### Security Constraints

- **Authentication:** All API endpoints require valid JWT tokens (except /health, /ready, /auth/\*)
- **Authorization:** Fine-grained scopes enforced on every protected endpoint
- **CORS:** Configure CORS_ORIGIN for frontend domain
- **Secrets management:** Never commit .env files, use .env.example templates
- **Token introspection:** Cached for performance, TTL configurable
- **Service accounts:** Bootstrap service account for setup only, runtime service account for operations

### Operational Constraints

- **Environment variables:** Must be configured before services start (see .env.example)
- **Migrations:** Run database migrations before starting server
- **Dependencies:** Docker Compose for local dev (Postgres, Zitadel), managed services for production
- **Logging:** All logs stored in `apps/logs/` directory, managed by workspace-cli
- **Process management:** Use workspace-cli commands (`workspace:start`, `workspace:stop`, `workspace:logs`) instead of direct PM2

### Business Constraints

- **Data privacy:** User data and embeddings stored in single-tenant PostgreSQL instance
- **Compliance:** Ensure proper data handling for sensitive documents
- **Cost management:** AI API costs scale with usage (embeddings, chat completions)

## External Dependencies

### Required Services

- **PostgreSQL 16+:** Primary data store with pgvector extension
- **Zitadel:** Self-hosted IAM for authentication (Docker Compose or managed instance)
- **Google Cloud:** Gemini API for embeddings and chat (requires GOOGLE_API_KEY)

### Optional Services

- **Vertex AI:** Alternative AI provider for enterprise deployments
- **Traefik:** Reverse proxy for production deployments

### External APIs

- **Google Gemini API:** Text embeddings (text-embedding-004), chat completions
- **Vertex AI API:** Alternative Google AI platform for enterprise
- **Zitadel API:** User management, OAuth tokens, introspection

### Development Dependencies

- **Docker & Docker Compose:** Local dev environment (database, auth)
- **PM2:** Process supervision via workspace-cli
- **Git submodules:** Reference UI/UX code in `reference/` (Nexus, react-daisyui)

### CI/CD

- **GitHub Actions:** Automated testing, linting, builds (see `.github/workflows/`)
- **Playwright browsers:** Installed for E2E tests
- **Nx Cloud:** Optional caching for faster builds
