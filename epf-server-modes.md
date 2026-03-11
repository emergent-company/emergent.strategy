# EPF CLI Server Modes

The server auto-detects its operating mode from environment variables at startup.

## Tool Modes

The server supports two tool modes, controlled by `EPF_SERVER_MODE`:

| `EPF_SERVER_MODE` | Tools | Description |
|---|---|---|
| *(unset, default)* | **80** | Full EPF authoring server — validation, health checks, wizards, generators, AIM, value model management, and strategy tools |
| `strategy` | **16** | Strategy-only read-only server — strategy queries, feature list, coverage, definitions, OKR progress |

The **strategy-only** mode (16 tools) is designed for consumers of strategy data — product repos, AI agents, or dashboards that need strategic context but don't author EPF artifacts.

The 16 strategy tools are split into two groups:

**Strategy query tools (8):**
- `epf_get_product_vision` — vision, mission, purpose, values
- `epf_get_personas` — list all personas
- `epf_get_persona_details` — full persona details
- `epf_get_value_propositions` — value propositions (optionally by persona)
- `epf_get_competitive_position` — competitive analysis and positioning
- `epf_get_roadmap_summary` — roadmap with OKRs and key results
- `epf_search_strategy` — search across all strategy content
- `epf_get_feature_strategy_context` — synthesized strategic context for a topic

**Strategy context tools (8):**
- `epf_list_features` — overview of all features with status
- `epf_get_strategic_context` — feature's value model contributions and KRs
- `epf_explain_value_path` — explain what a value model path means
- `epf_analyze_coverage` — feature coverage gaps in value model
- `epf_list_definitions` — browse track definitions
- `epf_get_definition` — read a specific track definition
- `epf_aim_status` — organizational context and LRA status
- `epf_aim_okr_progress` — OKR achievement rates from assessments

### CLI invocation

```bash
# Full server over stdio (80 tools) — for EPF authors
epf-cli serve
epf-cli serve --instance docs/EPF/_instances/emergent --watch

# Strategy-only server over stdio (16 tools) — for strategy consumers
epf-cli strategy serve docs/EPF/_instances/emergent --watch

# Strategy-only server over HTTP (16 tools) — for cloud deployment
EPF_SERVER_MODE=strategy epf-cli serve --http --instance /path/to/instance
```

---

## Transport & Auth Modes

Orthogonal to the tool mode, the server supports three transport/auth modes, auto-detected from environment variables.

### 1. Local Mode (default)

**Trigger:** No cloud env vars set.

**What it does:** Reads EPF artifacts from the local filesystem. Communicates over stdio (stdin/stdout) using the MCP protocol.

**Use case:** Local AI agent integrations — VS Code, Cursor, Claude Desktop, OpenCode, etc.

**Deployment:**

```bash
# Full server (80 tools)
epf-cli serve

# Full server with strategy instance pre-loaded
epf-cli serve --instance docs/EPF/_instances/emergent --watch

# Strategy-only (16 tools) via subcommand
epf-cli strategy serve docs/EPF/_instances/emergent --watch
```

No GitHub credentials, no OAuth, no HTTP server. The AI client spawns the process and talks MCP over stdio.

---

### 2. Single-Tenant Mode

**Trigger:** `EPF_GITHUB_OWNER` + `EPF_GITHUB_REPO` set, but **no** `EPF_OAUTH_CLIENT_ID`.

**What it does:** One container serves one EPF instance from a GitHub repo. Uses a **GitHub App** (private key + installation ID) to authenticate — no user identity or OAuth. Access control is handled externally (e.g., Cloud Run IAM, network policies).

**Use case:** Dedicated cloud deployment for a single product's EPF instance. Multiple AI clients can connect, all reading the same repo.

**Deployment env vars:**

| Variable | Required | Description |
|---|---|---|
| `EPF_GITHUB_APP_ID` | Yes | GitHub App numeric ID |
| `EPF_GITHUB_APP_INSTALLATION_ID` | Yes | Installation ID for the target org |
| `EPF_GITHUB_APP_PRIVATE_KEY` | Yes | PEM-encoded RSA private key (or file path) |
| `EPF_GITHUB_OWNER` | Yes | Repo owner (org or user) |
| `EPF_GITHUB_REPO` | Yes | Repo name |
| `EPF_GITHUB_REF` | No | Branch/tag/SHA (defaults to repo default branch) |
| `EPF_GITHUB_BASE_PATH` | No | Path within the repo (e.g., `docs/EPF/_instances/emergent`) |
| `EPF_SERVER_MODE` | No | Set to `strategy` for 16-tool read-only mode |

**Deployment example (Cloud Run):**

```bash
# Build and push
docker build -t gcr.io/my-project/epf-server .
docker push gcr.io/my-project/epf-server

# Deploy — full server (80 tools)
gcloud run deploy epf-server \
  --image gcr.io/my-project/epf-server \
  --set-env-vars "EPF_GITHUB_OWNER=my-org,EPF_GITHUB_REPO=my-epf" \
  --set-secrets "EPF_GITHUB_APP_ID=epf-app-id:latest,EPF_GITHUB_APP_INSTALLATION_ID=epf-install-id:latest,EPF_GITHUB_APP_PRIVATE_KEY=epf-private-key:latest" \
  --port 8080

# Deploy — strategy-only (16 tools)
gcloud run deploy epf-strategy \
  --image gcr.io/my-project/epf-server \
  --set-env-vars "EPF_GITHUB_OWNER=my-org,EPF_GITHUB_REPO=my-epf,EPF_SERVER_MODE=strategy" \
  --set-secrets "EPF_GITHUB_APP_ID=epf-app-id:latest,EPF_GITHUB_APP_INSTALLATION_ID=epf-install-id:latest,EPF_GITHUB_APP_PRIVATE_KEY=epf-private-key:latest" \
  --port 8080
```

The server creates a `TokenProvider` that signs JWTs with the App's private key, exchanges them for installation tokens (1-hour TTL, auto-rotated), and wraps it all in a `GitHubSource` + `CachedSource` to read files via the GitHub Contents API.

---

### 3. Multi-Tenant Mode

**Trigger:** `EPF_OAUTH_CLIENT_ID` is set.

**What it does:** Users authenticate via GitHub OAuth, discover their accessible EPF workspaces, and route MCP tool calls to any authorized repo. Each user gets a server-side session — the client only sees a signed JWT.

**Use case:** Shared cloud server serving many users across many orgs/repos. This is the SaaS deployment model.

#### Auth paths

Multi-tenant mode supports two auth backends that can run simultaneously:

| Auth Backend | Trigger | Token type | Repo scoping |
|---|---|---|---|
| **GitHub App** | `EPF_GITHUB_APP_ID` is set | `ghu_` (8h, refresh) | Installation-scoped (`contents: read`) |
| **OAuth App** | Only `EPF_OAUTH_CLIENT_ID` is set | `gho_` (no expiry) | Full `repo` scope (legacy) |

When both are configured, GitHub App is the primary path. The OAuth App path is kept as a fallback during the transition period.

#### Legacy OAuth App env vars

| Variable | Required | Description |
|---|---|---|
| `EPF_OAUTH_CLIENT_ID` | Yes | GitHub OAuth App client ID |
| `EPF_OAUTH_CLIENT_SECRET` | Yes | GitHub OAuth App client secret |
| `EPF_SESSION_SECRET` | Yes | 64+ hex char HMAC key for signing session JWTs |
| `EPF_SESSION_TTL` | No | Session lifetime (default: `24h`) |
| `EPF_SERVER_URL` | No | External base URL (for OAuth metadata, callbacks) |

#### GitHub App env vars (additive to above)

| Variable | Required | Description |
|---|---|---|
| `EPF_GITHUB_APP_ID` | Yes | GitHub App numeric ID |
| `EPF_GITHUB_APP_PRIVATE_KEY` | Yes | PEM-encoded RSA private key (or file path) for signing App JWTs |
| `EPF_GITHUB_APP_CLIENT_ID` | No | GitHub App OAuth client ID (enables `ghu_` token refresh) |
| `EPF_GITHUB_APP_CLIENT_SECRET` | No | GitHub App OAuth client secret (enables `ghu_` token refresh) |

#### Additional env vars

| Variable | Required | Description |
|---|---|---|
| `EPF_SERVER_MODE` | No | Set to `strategy` for 16-tool read-only mode |

**How it works:**

1. User authenticates via GitHub OAuth → server gets a user token (`ghu_` for App, `gho_` for OAuth)
2. Server stores token server-side, returns a signed JWT to the client
3. On repo access, `TokenResolver` finds the right installation covering the repo
4. Repo content is read using an installation token (1-hour TTL, shared across users in the same org)
5. If the user's `ghu_` token is near expiry (within 5 min), it's auto-refreshed using the `ghr_` refresh token

**GitHub App permissions (manifest):**

- `contents: read` — read repo files via Contents API
- `metadata: read` — read repo metadata (implicit, always granted)

No `read:user`, `read:org`, or `repo` OAuth scopes are needed. The `ghu_` token's permissions come entirely from the App manifest.

#### HTTP endpoints

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/auth/github/login` | GET | No | Redirects to GitHub OAuth consent |
| `/auth/github/callback` | GET | No | Exchanges code for session JWT |
| `/auth/token` | POST | No | PAT-based token exchange (alternative to OAuth) |
| `/workspaces` | GET | Bearer JWT | Lists user's accessible EPF workspaces |
| `/mcp` | POST | Bearer JWT | MCP tool calls with dynamic repo routing |
| `/.well-known/oauth-protected-resource` | GET | No | MCP OAuth metadata (RFC 9728) |
| `/.well-known/oauth-authorization-server` | GET | No | OAuth AS metadata (RFC 8414) |
| `/register` | POST | No | Dynamic client registration (RFC 7591) |
| `/authorize` | GET | No | MCP OAuth authorization (PKCE required) |
| `/token` | POST | No | MCP OAuth token exchange |
| `/health` | GET | No | Health check |

#### Deployment example

```bash
# 1. Create GitHub App at github.com/settings/apps
#    - Permissions: Contents (Read-only), Metadata (Read-only)
#    - Enable "Expire user authorization tokens"
#    - Set callback URL to https://your-server.com/auth/github/callback

# 2. Create GitHub OAuth App at github.com/settings/developers (for legacy fallback)
#    - Set callback URL to https://your-server.com/auth/github/callback

# 3. Generate session secret
export EPF_SESSION_SECRET=$(openssl rand -hex 32)

# 4. Set env vars
export EPF_OAUTH_CLIENT_ID="Iv1.abc123..."          # OAuth App (triggers multi-tenant mode)
export EPF_OAUTH_CLIENT_SECRET="secret..."
export EPF_GITHUB_APP_ID="123456"                     # GitHub App (enables installation scoping)
export EPF_GITHUB_APP_PRIVATE_KEY="/path/to/key.pem"
export EPF_GITHUB_APP_CLIENT_ID="Iv23.xyz..."         # Enables ghu_ token refresh
export EPF_GITHUB_APP_CLIENT_SECRET="secret..."

# 5. Deploy (full server, 80 tools)
epf-cli serve --http --port 8080 --cors-origins "https://your-frontend.com"

# 5b. Deploy (strategy-only, 16 tools)
EPF_SERVER_MODE=strategy epf-cli serve --http --port 8080 --cors-origins "https://your-frontend.com"
```

In multi-tenant mode, `instance_path` on MCP tools accepts `owner/repo` format (e.g., `emergent-company/emergent-epf`) and the server verifies access before routing.

---

## Docker

The Docker image supports all modes via environment variables. The entrypoint is:

```dockerfile
ENTRYPOINT ["/epf-server", "serve", "--http", "--sse"]
CMD ["--port", "8080"]
```

**Docker examples:**

```bash
# Strategy-only (16 tools, no auth)
docker run -p 8080:8080 \
  -e EPF_SERVER_MODE=strategy \
  -e EPF_STRATEGY_INSTANCE=/path/to/instance \
  ghcr.io/emergent-company/epf-server:latest

# Single-tenant (80 tools, GitHub App auth)
docker run -p 8080:8080 \
  -e EPF_GITHUB_APP_ID=123456 \
  -e EPF_GITHUB_APP_INSTALLATION_ID=789 \
  -e EPF_GITHUB_APP_PRIVATE_KEY="$(cat key.pem)" \
  -e EPF_GITHUB_OWNER=my-org \
  -e EPF_GITHUB_REPO=my-epf \
  ghcr.io/emergent-company/epf-server:latest

# Multi-tenant (80 tools, GitHub OAuth + App)
docker run -p 8080:8080 \
  -e EPF_OAUTH_CLIENT_ID=Iv1.abc123 \
  -e EPF_OAUTH_CLIENT_SECRET=secret \
  -e EPF_SESSION_SECRET=$(openssl rand -hex 32) \
  -e EPF_GITHUB_APP_ID=123456 \
  -e EPF_GITHUB_APP_PRIVATE_KEY="$(cat key.pem)" \
  ghcr.io/emergent-company/epf-server:latest
```

---

## Summary

| | Local | Single-Tenant | Multi-Tenant (OAuth) | Multi-Tenant (GitHub App) |
|---|---|---|---|---|
| **Transport** | stdio | HTTP | HTTP | HTTP |
| **Auth** | None | GitHub App (machine) | GitHub OAuth App (per-user) | GitHub App (per-user + installation) |
| **Repos** | Filesystem | One repo | Any authorized repo | Repos where App is installed |
| **Identity** | None | None (IAM external) | GitHub user | GitHub user |
| **Token type** | N/A | Installation token (1h, rotated) | OAuth token (`gho_`, no expiry) | User token (`ghu_`, 8h) + refresh |
| **Repo token** | N/A | Installation token | User's OAuth token | Installation token (shared per-org) |
| **Deploy target** | Local process | Cloud Run / container | Cloud Run / container | Cloud Run / container |
| **Tool modes** | Full (80) or strategy (16) | Full (80) or strategy (16) | Full (80) or strategy (16) | Full (80) or strategy (16) |

All modes support `EPF_SERVER_MODE=strategy` to restrict to 16 read-only tools.
