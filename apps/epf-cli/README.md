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

The EPF Cloud Server lets you deploy epf-cli as a remote MCP server so your team can access EPF strategy tools without any local installation. It reads EPF data directly from a GitHub repository via a GitHub App, serves MCP tools over HTTP, and runs anywhere containers run.

**Key properties:**

- **No local setup for clients** — team members just add the server URL to their AI tool
- **GitHub as source of truth** — reads EPF artifacts from your repo via GitHub Contents API
- **Auto-rotating auth** — GitHub App installation tokens refresh automatically
- **Two transports** — Streamable HTTP (MCP spec 2025-03-26) + SSE fallback for legacy clients
- **Minimal footprint** — ~10MB distroless container, scales to zero on Cloud Run

### Quick Start (GCP Cloud Run)

The fastest path from zero to a running EPF cloud server:

```bash
# 1. Create a GitHub App (see "GitHub App Setup" below)

# 2. Run one-time GCP infrastructure setup
cd apps/epf-cli
./scripts/setup-gcp.sh --project YOUR_GCP_PROJECT_ID

# 3. Add secrets to GCP Secret Manager (script prints the exact commands)

# 4. Configure GitHub repository secrets and variables (script prints what to set)

# 5. Push to main — the deploy workflow builds, pushes, and deploys automatically
git push origin main
```

The deploy workflow (`.github/workflows/deploy.yaml`) handles everything: runs tests, builds the Docker image with embedded schemas, pushes to Artifact Registry, and deploys to Cloud Run.

After the first deploy, subsequent pushes to `apps/epf-cli/**` on `main` auto-deploy.

### Running Locally with Docker

```bash
# Build the image (requires a GitHub PAT with repo access to epf-canonical)
cd apps/epf-cli
docker build --secret id=gh_token,env=GITHUB_TOKEN \
  --build-arg VERSION=$(cat VERSION) \
  --build-arg GIT_COMMIT=$(git rev-parse --short HEAD) \
  -t epf-server .

# Run with GitHub App credentials
docker run -p 8080:8080 \
  -e EPF_GITHUB_APP_ID=123456 \
  -e EPF_GITHUB_APP_INSTALLATION_ID=78901234 \
  -e EPF_GITHUB_APP_PRIVATE_KEY="$(cat your-app.private-key.pem)" \
  -e EPF_GITHUB_OWNER=your-org \
  -e EPF_GITHUB_REPO=your-epf-repo \
  epf-server

# Check health
curl http://localhost:8080/health
```

### Running with Docker Compose

The simplest way to run the cloud server locally or on a VM:

```bash
cd apps/epf-cli

# 1. Copy the example env file and fill in your values
cp .env.example .env
# Edit .env with your GitHub App credentials and repo details

# 2. Build and start (requires GITHUB_TOKEN for building)
GITHUB_TOKEN=ghp_your_token docker compose up --build

# 3. Check health
curl http://localhost:8080/health
```

The `docker-compose.yaml` builds the image locally from the Dockerfile and loads configuration from your `.env` file. See `.env.example` for all available options with descriptions.

To run in the background: `docker compose up --build -d`
To stop: `docker compose down`

### GitHub App Setup

The cloud server authenticates to GitHub using a GitHub App (not a PAT), which provides fine-grained permissions and auto-rotating tokens.

1. **Create the GitHub App:**
   - Go to your org settings → Developer settings → GitHub Apps → New GitHub App
   - Name: e.g. `EPF Strategy Server`
   - Homepage URL: your org URL
   - Uncheck "Webhook → Active" (not needed)
   - Permissions → Repository permissions:
     - **Contents**: Read-only (required — reads EPF YAML files)
   - Where can this app be installed: "Only on this account"
   - Click "Create GitHub App"

2. **Generate a private key:**
   - On the app page, scroll to "Private keys" → "Generate a private key"
   - Save the `.pem` file securely

3. **Install the app on your repo:**
   - On the app page, click "Install App" in the sidebar
   - Choose your organization
   - Select "Only select repositories" → pick your EPF repo
   - Click "Install"

4. **Collect credentials:**
   - **App ID**: shown on the app settings page (a number like `123456`)
   - **Installation ID**: from the URL after installing — go to your org settings → Installed GitHub Apps → click "Configure" on your app → the number in the URL (`/installations/78901234`)
   - **Private key**: the `.pem` file you downloaded

### Environment Variables

See `.env.example` for an annotated template with all options.

| Variable | Required | Description |
| --- | --- | --- |
| `EPF_GITHUB_APP_ID` | Yes (cloud mode) | GitHub App ID (numeric) |
| `EPF_GITHUB_APP_PRIVATE_KEY` | Yes (cloud mode) | Path to PEM file, or inline PEM content (if value starts with `-----BEGIN`) |
| `EPF_GITHUB_APP_INSTALLATION_ID` | Yes (cloud mode) | GitHub App installation ID (numeric) |
| `EPF_GITHUB_OWNER` | Yes (cloud mode) | GitHub org or user that owns the EPF repo |
| `EPF_GITHUB_REPO` | Yes (cloud mode) | Repository name containing EPF instance |
| `EPF_GITHUB_REF` | No | Branch, tag, or SHA to read from (default: repo default branch) |
| `EPF_GITHUB_BASE_PATH` | No | Path within repo to EPF instance (e.g. `docs/EPF/_instances/my-product`) |
| `EPF_INSTANCE_NAME` | No | Human-readable name shown in `/health` response |
| `EPF_STRATEGY_INSTANCE` | No | Local filesystem path (overridden by GitHub source when configured) |
| `PORT` | No | HTTP port (default: `8080`, Cloud Run sets this automatically) |

When none of the `EPF_GITHUB_APP_*` variables are set, the server runs in filesystem mode (same as `epf-cli serve`). If some but not all are set, the server exits with an error.

### HTTP Endpoints

| Endpoint | Method | Description |
| --- | --- | --- |
| `/mcp` | POST | Streamable HTTP transport (primary, MCP spec 2025-03-26) |
| `/sse` | GET | SSE transport (legacy fallback, requires `--sse` flag) |
| `/message` | POST | SSE message endpoint (legacy fallback, requires `--sse` flag) |
| `/health` | GET | Health check — returns JSON with status, uptime, version, instance info |

### Connecting MCP Clients

Once your cloud server is running, configure your AI tool to connect:

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "epf-cloud": {
      "url": "https://your-cloud-run-url.run.app/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_IDENTITY_TOKEN"
      }
    }
  }
}
```

**VS Code / Cursor** (`.vscode/mcp.json`):

```json
{
  "servers": {
    "epf-cloud": {
      "type": "http",
      "url": "https://your-cloud-run-url.run.app/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_IDENTITY_TOKEN"
      }
    }
  }
}
```

**OpenCode** (`opencode.jsonc`):

```jsonc
{
  "mcp": {
    "epf-cloud": {
      "type": "remote",
      "url": "https://your-cloud-run-url.run.app/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_IDENTITY_TOKEN"
      }
    }
  }
}
```

> **Note on authentication:** When deployed to Cloud Run with `--no-allow-unauthenticated`,
> clients must include a GCP identity token. Generate one with:
> ```bash
> gcloud auth print-identity-token --audiences="https://your-cloud-run-url.run.app"
> ```
> For programmatic access, grant the caller `roles/run.invoker` on the Cloud Run service.

### Cloud Run Configuration

The deploy workflow configures Cloud Run with these settings:

| Setting | Value | Rationale |
| --- | --- | --- |
| Min instances | 0 | Scale to zero when idle (cost savings) |
| Max instances | 3 | Sufficient for team use |
| Memory | 256Mi | EPF data is small; parsing is fast |
| CPU | 1 | Single core handles many concurrent MCP sessions |
| Timeout | 300s | Long enough for complex strategy queries |
| Auth | IAM (`--no-allow-unauthenticated`) | Cloud Run handles client auth (Stage 1) |
| Execution | gen2 | Better cold start performance |
| Startup CPU boost | Enabled | Fast cold starts |

To customize, edit the `gcloud run deploy` command in `.github/workflows/deploy.yaml`.

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
