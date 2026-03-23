# epf-cli

**The EPF Kernel** - Schema Validator, MCP Server, LSP Server, and AI Agent Guide for ProductFactoryOS.

## Role

epf-cli is the **normative authority** for EPF operations. It:

- **Validates** EPF YAML artifacts against JSON schemas
- **Discovers** EPF instances with confidence scoring
- **Guides** AI agents with structured instructions
- **Serves** MCP tools for programmatic operations
- **Provides** real-time editor integration via LSP server
- **Migrates** legacy instances to modern structure
- **Exposes** product strategy to AI agents via Strategy Server

**Important:** epf-cli does NOT write content. It validates, discovers, and guides. AI agents write content, epf-cli validates it.

## Installation

### Homebrew (macOS / Linux)

```bash
brew tap emergent-company/tap
brew install epf-cli
```

To upgrade to the latest version:

```bash
brew upgrade epf-cli
```

### Download Binary

Pre-built binaries for macOS (arm64/amd64), Linux (arm64/amd64), and Windows (amd64) are available on the [GitHub Releases](https://github.com/emergent-company/emergent.strategy/releases) page.

### Build from Source

```bash
cd apps/epf-cli
go build -o epf-cli .
```

### Update Notifications

epf-cli automatically checks for new versions once every 24 hours. When a new version is available, a notice is printed to stderr:

```
  A new version of epf-cli is available: 0.12.6 → 0.13.0
  Update with: brew upgrade epf-cli
  Release: https://github.com/emergent-company/emergent.strategy/releases/tag/v0.13.0
  Disable: EPF_CLI_NO_UPDATE_CHECK=1 or set update_check: false in ~/.epf-cli/config.yaml
```

To disable update checks:

```bash
# Environment variable
export EPF_CLI_NO_UPDATE_CHECK=1

# Or in config file (~/.epf-cli/config.yaml)
update_check: false
```

### Self-Update (Standalone Installs)

If you installed via direct binary download (not Homebrew):

```bash
epf-cli update
```

This downloads the latest release, verifies the SHA256 checksum, and replaces the current binary. Homebrew users should use `brew upgrade epf-cli` instead.

## Quick Start for AI Agents

```bash
# 1. Get AI agent instructions (start here!)
epf-cli agent

# 2. Find EPF instances
epf-cli locate

# 3. Check instance health
epf-cli health [instance-path]

# 4. Validate files after editing
epf-cli validate path/to/file.yaml

# 5. Access product strategy (NEW in v0.16.0)
epf-cli strategy status ./epf

# 6. Start LSP server for real-time editor integration
epf-cli lsp
```

## Usage

### AI Agent Guidance

```bash
# Display comprehensive AI agent instructions
epf-cli agent

# JSON output for programmatic use
epf-cli agent --json
```

### Find EPF Instances

```bash
# Search current directory tree
epf-cli locate

# Search with specific depth
epf-cli locate --max-depth 10

# Only show instances with anchor files
epf-cli locate --require-anchor

# JSON output
epf-cli locate --json
```

### Validate EPF Files

```bash
# Validate all EPF files in a directory
epf-cli validate .

# Validate a specific file
epf-cli validate epf/strategy/north_star.yaml

# AI-friendly validation output (includes product context, template warnings, semantic warnings)
epf-cli validate file.yaml --ai-friendly
```

**New in v0.14.0:** The `--ai-friendly` output now includes:

- **Product context** - Product name, description, and keywords from instance metadata
- **Template warnings** - Detects TBD, TODO, [INSERT...] placeholders
- **Semantic warnings** - Flags content that may not align with the product domain

### Migrate Legacy Instances

```bash
# Add anchor file to legacy instance
epf-cli migrate-anchor path/to/instance

# Preview what would be created
epf-cli migrate-anchor --dry-run
```

### Health Check

```bash
# Run comprehensive health check (8 checks)
epf-cli health [instance-path]

# Include anchor file validation
epf-cli health --verbose
```

### Start MCP Server

```bash
# Start MCP server (49 tools available)
epf-cli serve

# Custom port
epf-cli serve --port 3200
```

### LSP Server

Start the Language Server Protocol server for real-time EPF YAML validation, completions, hover docs, code actions, and go-to-definition in your editor.

```bash
# Start LSP server (stdio, for editor integration)
epf-cli lsp

# TCP mode for debugging
epf-cli lsp --tcp :7998
```

**Features:** Real-time diagnostics, schema-aware completions, hover documentation with constraints, quick-fix code actions, go-to-definition for value model paths and feature dependencies, workspace-wide relationship validation, content readiness warnings.

See [AGENTS.md](./AGENTS.md) for editor configuration guides (VS Code, Cursor, Neovim).

### Product Strategy Server (v0.16.0)

The Strategy Server provides read-only access to EPF product strategy for AI agents. It exposes vision, personas, competitive positioning, and roadmap data through MCP tools.

```bash
# Check strategy store status
epf-cli strategy status ./epf

# JSON output for programmatic use
epf-cli strategy status ./epf --json

# Export strategy as markdown document
epf-cli strategy export ./epf

# Export to file
epf-cli strategy export ./epf --output strategy.md

# Start MCP server with strategy tools pre-loaded
epf-cli strategy serve ./epf

# With file watching for auto-reload
epf-cli strategy serve ./epf --watch
```

**Strategy MCP Tools:**

| Tool                               | Description                                    |
| ---------------------------------- | ---------------------------------------------- |
| `epf_get_product_vision`           | Get vision, mission, and north star            |
| `epf_get_personas`                 | List all personas with summaries               |
| `epf_get_persona_details`          | Get full persona details including pain points |
| `epf_get_value_propositions`       | Get value propositions, optionally by persona  |
| `epf_get_competitive_position`     | Get competitive analysis and positioning       |
| `epf_get_roadmap_summary`          | Get OKRs and key results, optionally by track  |
| `epf_search_strategy`              | Full-text search across all strategy artifacts |
| `epf_get_feature_strategy_context` | Get strategic context for a specific feature   |

**Use cases:**

- **Context-aware development**: Understand product vision before implementing features
- **User research**: Access persona details and pain points when designing UX
- **Competitive awareness**: Review positioning before feature design
- **Strategic alignment**: Verify work aligns with current OKRs

## Cloud Server (Self-Hosting)

The EPF Cloud Server lets you deploy epf-cli as a remote MCP server so your team can access EPF strategy tools from any AI tool. It reads EPF data from GitHub repositories and serves 80+ MCP tools over HTTP.

**Key properties:**

- **Multi-tenant** — users authenticate with GitHub, discover their EPF workspaces, and route MCP calls to any authorized repo
- **MCP OAuth 2.1** — Claude, OpenCode, and Cursor connect natively via OAuth auto-discovery
- **Interactive CLI** — `epf-cli connect` provides a TUI for authentication and workspace selection
- **GitHub as source of truth** — reads EPF artifacts via GitHub Contents API
- **Minimal footprint** — ~10MB distroless container, scales to zero on Cloud Run

### Server Modes

The server auto-detects its mode from environment variables:

| Mode | Trigger | Use Case |
| --- | --- | --- |
| **Multi-tenant** | `EPF_OAUTH_CLIENT_ID` set | Teams: users auth with GitHub, discover workspaces |
| **Single-tenant** | `EPF_GITHUB_OWNER` + `EPF_GITHUB_REPO` (no OAuth) | One container per repo, no user auth |
| **Local** | Neither set | Filesystem access, stdio transport (`epf-cli serve`) |

### Quick Start (Multi-Tenant with Docker)

The recommended setup for teams:

```bash
cd apps/epf-cli

# 1. Create a GitHub OAuth App (see "GitHub OAuth App Setup" below)

# 2. Configure environment
cp .env.example .env
# Edit .env:
#   EPF_OAUTH_CLIENT_ID=<your-oauth-app-client-id>
#   EPF_OAUTH_CLIENT_SECRET=<your-oauth-app-client-secret>
#   EPF_SESSION_SECRET=$(openssl rand -hex 32)
#   EPF_SERVER_URL=http://localhost:8080

# 3. Build and start
export GITHUB_TOKEN=<github-pat-with-repo-scope>
docker compose up --build -d

# 4. Verify
curl http://localhost:8080/health
```

Then connect from the CLI:

```bash
epf-cli connect http://localhost:8080
```

### Using a Pre-Built Docker Image

Pre-built images are published to GitHub Container Registry on every release:

```bash
# Pull the latest release
docker pull ghcr.io/emergent-company/epf-server:latest

# Or pin to a specific version
docker pull ghcr.io/emergent-company/epf-server:0.25.0

# Run in multi-tenant mode
docker run -p 8080:8080 \
  -e EPF_OAUTH_CLIENT_ID=<client-id> \
  -e EPF_OAUTH_CLIENT_SECRET=<client-secret> \
  -e EPF_SESSION_SECRET=$(openssl rand -hex 32) \
  -e EPF_SERVER_URL=http://localhost:8080 \
  ghcr.io/emergent-company/epf-server:latest
```

### Building from Source

If you prefer to build the image yourself:

```bash
cd apps/epf-cli

# Build (requires GITHUB_TOKEN with repo scope for embedded artifacts)
export GITHUB_TOKEN=<your-pat>
docker build --secret id=gh_token,env=GITHUB_TOKEN \
  --build-arg VERSION=$(cat VERSION) \
  --build-arg GIT_COMMIT=$(git rev-parse --short HEAD) \
  -t epf-server .

# Run
docker run -p 8080:8080 --env-file .env epf-server
```

### GitHub OAuth App Setup

Multi-tenant mode requires a GitHub OAuth App for user authentication.

1. **Create the OAuth App:**
   - Go to [GitHub Developer Settings > OAuth Apps](https://github.com/settings/developers) → New OAuth App
   - **Application name**: e.g. `EPF Strategy Server`
   - **Homepage URL**: your server URL (e.g. `http://localhost:8080`)
   - **Authorization callback URL**: your server callback URL (e.g. `http://localhost:8080/auth/github/callback`)
   - Check **Enable Device Flow** (required for CLI login)
   - Click "Register application"

2. **Collect credentials:**
   - **Client ID**: shown on the app page (starts with `Ov23li...`)
   - **Client Secret**: click "Generate a new client secret" and copy it immediately

3. **Configure the server:**
   ```bash
   EPF_OAUTH_CLIENT_ID=<client-id>
   EPF_OAUTH_CLIENT_SECRET=<client-secret>
   EPF_SESSION_SECRET=$(openssl rand -hex 32)
   ```

### Connecting from the CLI

The interactive Connect TUI handles authentication and workspace selection:

```bash
# Interactive connection (Device Flow auth + workspace selection)
epf-cli connect http://your-server:8080

# Headless login (for CI/scripting)
epf-cli login --server http://your-server:8080
```

The Connect TUI:
1. Checks server health
2. Authenticates via GitHub Device Flow (or paste a token)
3. Discovers your EPF workspaces
4. Generates an MCP config snippet for your AI tool

Credentials are stored locally in `~/.config/epf-cli/auth.json`. On subsequent runs, authentication is skipped if a valid token exists.

### Connecting AI Tools

**Claude** connects via MCP OAuth auto-discovery (no manual config needed):
- Go to Settings → Connectors → Add URL → enter your server URL
- Claude handles the OAuth flow automatically

**OpenCode** (`opencode.jsonc`) — use the config snippet from `epf-cli connect`:

```jsonc
{
  "mcp": {
    "epf-remote": {
      "type": "remote",
      "url": "http://your-server:8080/mcp",
      "headers": {
        "Authorization": "Bearer <jwt-from-connect>"
      }
    }
  }
}
```

**VS Code / Cursor** (`.vscode/mcp.json`):

```json
{
  "servers": {
    "epf-remote": {
      "type": "http",
      "url": "http://your-server:8080/mcp",
      "headers": {
        "Authorization": "Bearer <jwt-from-connect>"
      }
    }
  }
}
```

### Environment Variables

See `.env.example` for an annotated template with all options.

**Multi-tenant mode:**

Current production multi-tenant mode still requires GitHub OAuth plus a session secret. GitHub App credentials are additive for installation-scoped repo access; they do not replace `EPF_OAUTH_*` today.

| Variable | Required | Description |
| --- | --- | --- |
| `EPF_OAUTH_CLIENT_ID` | Yes | GitHub OAuth App client ID |
| `EPF_OAUTH_CLIENT_SECRET` | Yes | GitHub OAuth App client secret |
| `EPF_SESSION_SECRET` | Yes | 64+ hex char session signing secret (`openssl rand -hex 32`) |
| `EPF_GITHUB_APP_ID` | Yes | GitHub App ID for installation-scoped repo access |
| `EPF_GITHUB_APP_PRIVATE_KEY` | Yes | Inline PEM or file path for signing GitHub App JWTs |
| `EPF_GITHUB_APP_CLIENT_ID` | No | Enables refresh of GitHub App user tokens (`ghu_`) |
| `EPF_GITHUB_APP_CLIENT_SECRET` | No | Enables refresh of GitHub App user tokens (`ghu_`) |
| `EPF_SERVER_URL` | Recommended | External server URL for OAuth redirects (default: `http://localhost:PORT`) |
| `EPF_SESSION_TTL` | No | Session lifetime as Go duration (default: `24h`) |
| `PORT` | No | HTTP port (default: `8080`) |

**Single-tenant mode:**

| Variable | Required | Description |
| --- | --- | --- |
| `EPF_GITHUB_APP_ID` | Yes | GitHub App ID (numeric) |
| `EPF_GITHUB_APP_PRIVATE_KEY` | Yes | Path to PEM file, or inline PEM content |
| `EPF_GITHUB_APP_INSTALLATION_ID` | Yes | GitHub App installation ID (numeric) |
| `EPF_GITHUB_OWNER` | Yes | GitHub org or user that owns the EPF repo |
| `EPF_GITHUB_REPO` | Yes | Repository name containing EPF instance |
| `EPF_GITHUB_REF` | No | Branch, tag, or SHA (default: repo default branch) |
| `EPF_GITHUB_BASE_PATH` | No | Path within repo to EPF instance |
| `PORT` | No | HTTP port (default: `8080`) |

### HTTP Endpoints

**All modes:**

| Endpoint | Method | Auth | Description |
| --- | --- | --- | --- |
| `/mcp` | POST | None in local/single-tenant, Bearer JWT in multi-tenant | MCP Streamable HTTP transport (80+ tools) |
| `/health` | GET | None | Health check (status, uptime, mode, version) |

**Multi-tenant mode (additional):**

| Endpoint | Method | Auth | Description |
| --- | --- | --- | --- |
| `/auth/github/login` | GET | None | Redirects to GitHub OAuth consent |
| `/auth/github/callback` | GET | None | OAuth callback, returns session JWT |
| `/auth/token` | POST | None | Exchange GitHub token for session JWT |
| `/workspaces` | GET | Bearer JWT | List user's EPF workspaces |
| `/.well-known/oauth-protected-resource` | GET | None | MCP OAuth resource metadata (RFC 9728) |
| `/.well-known/oauth-authorization-server` | GET | None | MCP OAuth server metadata (RFC 8414) |
| `/register` | POST | None | MCP dynamic client registration (RFC 7591) |
| `/authorize` | GET | None | MCP OAuth authorization endpoint |
| `/token` | POST | None | MCP OAuth token endpoint |

**Legacy (opt-in with `--sse` flag):**

| Endpoint | Method | Description |
| --- | --- | --- |
| `/sse` | GET | SSE transport for legacy MCP clients |
| `/message` | POST | SSE message endpoint |

### Deploying to GCP Cloud Run

Production deploys are release-driven. Each Git tag matching `v*` runs `.github/workflows/release.yaml`, publishes the container to GHCR and Artifact Registry, then deploys Cloud Run service `epf-strategy` in `outblocks/europe-west1`.

```bash
# 1. Export the secrets that should be copied into GCP Secret Manager
export EPF_OAUTH_CLIENT_ID=<oauth-client-id>
export EPF_OAUTH_CLIENT_SECRET=<oauth-client-secret>
export EPF_GITHUB_APP_ID=<github-app-id>
export EPF_GITHUB_APP_PRIVATE_KEY="$(cat /path/to/github-app-private-key.pem)"

# Optional GitHub App refresh credentials
# export EPF_GITHUB_APP_CLIENT_ID=<github-app-client-id>
# export EPF_GITHUB_APP_CLIENT_SECRET=<github-app-client-secret>

# 2. Run one-time GCP infrastructure setup
cd apps/epf-cli
./scripts/setup-gcp.sh

# 3. Configure the GitHub repository secrets printed by the bootstrap script

# 4. Create a release tag
git tag v0.25.0
git push origin v0.25.0
```

Bootstrap creates the required GCP infrastructure, stores the exported runtime credentials in Secret Manager, and generates `EPF_SESSION_SECRET` automatically when the secret does not already exist.

The release workflow is the primary production path. `.github/workflows/deploy.yaml` remains as a manual fallback for redeploying a specific Artifact Registry image. The service is configured with `EPF_SERVER_URL=https://strategy.emergent-company.ai`, so GitHub OAuth metadata and callbacks use the public custom domain rather than the temporary Cloud Run URL.

| Setting | Value | Rationale |
| --- | --- | --- |
| Service | `epf-strategy` | Public strategy server |
| Region | `europe-west1` | Target production region |
| Custom domain | `strategy.emergent-company.ai` | Stable external URL after one-time domain mapping |
| CORS | `*` | Public browser clients can connect |
| Min instances | 0 | Scale to zero when idle |
| Max instances | 10 | Burst capacity for public traffic |
| Memory | 512Mi | Small distroless runtime |
| CPU | 1 | Adequate for concurrent MCP sessions |
| Timeout | 300s | Long enough for workspace discovery |

### Local Docker and Manual Deploy Commands

The `Makefile` includes local helpers that mirror the production container/deploy path:

```bash
cd apps/epf-cli

# Build the container locally (requires EPF_CANONICAL_TOKEN or GITHUB_TOKEN)
make docker-build VERSION=dev

# Run the built container locally
make docker-run VERSION=dev DOCKER_RUN_ENV_FILE=.env

# Push the image to Artifact Registry
make docker-push-gcp VERSION=dev

# Manually deploy the pushed image to Cloud Run (tag is resolved to a digest first)
make deploy-manual VERSION=dev

# Or deploy an explicit immutable image reference
make deploy-manual DEPLOY_IMAGE_REF=europe-west1-docker.pkg.dev/outblocks/epf/epf-server@sha256:<digest>

# Verify the deployed /health endpoint
make deploy-check
```

For local production-like deploys, the same secret names and Cloud Run settings are reused.

The custom domain mapping itself remains a one-time GCP/DNS step after the first successful deploy.

## Architecture

```
epf-cli/
├── cmd/                # Cobra commands
│   ├── root.go         # Root + schema dir auto-detection
│   ├── agent.go        # AI agent instructions
│   ├── locate.go       # EPF instance discovery
│   ├── health.go       # Comprehensive health check
│   ├── validate.go     # Schema validation
│   ├── strategy.go     # Strategy server commands
│   ├── migrate_anchor.go # Legacy migration
│   ├── serve.go        # MCP server
│   ├── lsp.go          # LSP server
│   └── ...
├── internal/
│   ├── anchor/         # Anchor file management
│   ├── discovery/      # EPF instance discovery
│   ├── schema/         # Schema loading
│   ├── strategy/       # Strategy store (model, parser, search, watcher)
│   ├── lsp/            # LSP server (diagnostics, completions, hover, code actions)
│   ├── mcp/            # MCP server (49 tools)
│   └── validator/      # YAML validation logic
├── main.go
└── go.mod
```

## Anchor Files

The `_epf.yaml` anchor file is the authoritative marker for EPF instances:

```yaml
epf_anchor: true
version: '1.0.0'
instance_id: '550e8400-e29b-41d4-a716-446655440000'
created_at: 2024-01-15T10:30:00Z
product_name: 'My Product'
epf_version: '2.0.0'
```

See [AGENTS.md](./AGENTS.md) for comprehensive documentation.

## Related

- **product-factory-os**: The TUI that orchestrates epf-cli
- **opencode-epf**: OpenCode plugin providing proactive guardrails and dashboard tools (`packages/opencode-epf/`)
- **EPF Canonical**: Schema definitions at `docs/EPF/`
- **AGENTS.md**: Full AI agent instructions (embedded in binary)
