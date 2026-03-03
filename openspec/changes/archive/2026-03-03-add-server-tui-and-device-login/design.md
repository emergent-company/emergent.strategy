## Context

The EPF cloud server (multi-tenant mode) needs to support three distinct integration paths for AI tools:

1. **Cloud AI tools** (Claude Cowork, OpenCode, Cursor) — these implement the MCP Authorization Spec and expect the server to act as an OAuth 2.1 authorization server. The user adds the server URL in the tool's settings, authorizes via browser, and the tool handles token management automatically.

2. **Terminal users** — developers who want to connect their AI tool to a remote EPF server from the terminal. They need a guided flow: authenticate, discover workspaces, select an instance, and get a config snippet to paste into their AI tool.

3. **CI/scripting** — headless authentication without interactive prompts, for automation pipelines.

The current auth infrastructure (GitHub OAuth redirect flow in `handlers.go`, JWT session management in `session.go`, bearer token middleware in `middleware.go`) provides the building blocks but doesn't satisfy any of these paths directly.

### Stakeholders

- **Cloud AI users** — want to add an EPF server URL in Claude Cowork settings and have it work (OAuth flow handled by the tool)
- **Solo developers** — want to connect their AI tool to a remote EPF server with minimal setup via terminal
- **Team members** — need to authenticate and select the right workspace for their project
- **Platform operators** — need the server to be compatible with the MCP ecosystem
- **CI/automation** — needs headless auth without interactive prompts

## Goals / Non-Goals

### Goals

- EPF server implements the MCP Authorization Spec (2025-06-18) so Claude Cowork, OpenCode, and Cursor can connect natively
- `epf-cli connect <url>` provides a guided TUI flow: connect → authenticate → discover → select → get config
- `epf-cli login --server <url>` provides headless Device Flow auth for scripting
- Zero-config authentication via GitHub Device Flow (no OAuth App registration by end users)
- Token persistence across sessions in `~/.config/epf-cli/auth.json`
- `POST /auth/token` endpoint on server for GitHub token → JWT exchange
- Ready-to-paste MCP config snippet at the end of the connect flow

### Non-Goals

- Server-side TUI dashboard (operators monitor via logs, health endpoint, or external tooling)
- Web UI for authentication (cloud AI tools handle this via OAuth, browser users use `/auth/github/login`)
- Token refresh / rotation for Device Flow tokens (GitHub OAuth tokens don't expire unless revoked)
- Multi-server management UI (token store supports multiple servers, but no TUI for managing them)
- Full RFC 7591 features (we implement the subset needed for MCP clients — no custom metadata, no policies)

## Decisions

### MCP OAuth Authorization Server (Third-Party Authorization Flow)

**Decision**: The EPF server acts as both an OAuth 2.1 authorization server (to MCP clients like Claude, OpenCode) and an OAuth client (to GitHub). This is the "Third-Party Authorization Flow" from the MCP spec.

The flow:

1. MCP client hits `POST /mcp` → server returns **401 Unauthorized** with `WWW-Authenticate` header pointing to `/.well-known/oauth-protected-resource`
2. Client fetches `GET /.well-known/oauth-protected-resource` → returns Protected Resource Metadata (RFC 9728) with `authorization_servers` list
3. Client fetches `GET /.well-known/oauth-authorization-server` → returns Authorization Server Metadata (RFC 8414) with endpoint locations
4. Client does Dynamic Client Registration via `POST /register` (RFC 7591) → gets `client_id`
5. Client opens browser to `GET /authorize?client_id=...&redirect_uri=...&code_challenge=...&resource=...` → server redirects to GitHub OAuth
6. User authorizes on GitHub → GitHub redirects to server's internal callback → server gets GitHub access token
7. Server redirects to MCP client's `redirect_uri` with an authorization code
8. Client exchanges code for access token via `POST /token` with `code_verifier` and `resource`
9. Client uses access token as `Authorization: Bearer <token>` on all MCP requests

**Why**: This is the only way to support Claude Cowork and other cloud AI tools. They implement the MCP Authorization Spec and expect the server to follow it. Without these endpoints, Claude cannot connect to the EPF server at all.

**Alternative considered**: Require users to manually copy a bearer token from the CLI into their AI tool's settings. Rejected — this defeats the purpose of cloud AI integration and doesn't work for Claude Cowork which has no mechanism for custom bearer token headers.

### Authorization Server Metadata Endpoints

**Decision**: Implement three metadata/registration endpoints:

1. **`GET /.well-known/oauth-protected-resource`** — Returns Protected Resource Metadata (RFC 9728):
   ```json
   {
     "resource": "https://epf.example.com",
     "authorization_servers": ["https://epf.example.com"],
     "bearer_methods_supported": ["header"],
     "scopes_supported": ["epf:read"]
   }
   ```

2. **`GET /.well-known/oauth-authorization-server`** — Returns Authorization Server Metadata (RFC 8414):
   ```json
   {
     "issuer": "https://epf.example.com",
     "authorization_endpoint": "https://epf.example.com/authorize",
     "token_endpoint": "https://epf.example.com/token",
     "registration_endpoint": "https://epf.example.com/register",
     "response_types_supported": ["code"],
     "grant_types_supported": ["authorization_code"],
     "code_challenge_methods_supported": ["S256"],
     "scopes_supported": ["epf:read"]
   }
   ```

3. **`POST /register`** — Dynamic Client Registration (RFC 7591). Stores registrations in-memory (ephemeral, same lifecycle as server). Returns `client_id` (no secret — public clients).

**Why**: The 2025-06-18 MCP spec requires Protected Resource Metadata (RFC 9728) and Authorization Server Metadata (RFC 8414). Claude's client implementation follows this discovery flow. Dynamic Client Registration is SHOULD in the spec but required for Claude (which uses DCR by default).

### Authorization Code Flow with PKCE

**Decision**: The `/authorize` and `/token` endpoints implement the authorization code grant with PKCE:

- `/authorize` validates `client_id` (from DCR registry), stores `redirect_uri` + `code_challenge` + `state`, then redirects to GitHub OAuth
- GitHub callback at `/authorize/callback` (internal, different from the existing `/auth/github/callback`) exchanges the GitHub code for a GitHub token, creates a server session, generates an authorization code, and redirects to the MCP client's `redirect_uri` with `code` + `state`
- `/token` validates the authorization code, verifies `code_verifier` against stored `code_challenge`, and returns an access token (our existing JWT)

**Why**: PKCE is REQUIRED by OAuth 2.1. The authorization code flow is the only grant type that makes sense for user-authorized access in browser-based flows.

**Implementation detail**: Authorization codes are stored in-memory with a 10-minute expiry and single-use enforcement (same pattern as the existing CSRF state map in `handlers.go`). This is adequate for a self-hosted server — codes are exchanged within seconds.

### Separation from Existing OAuth Endpoints

**Decision**: The MCP OAuth endpoints (`/authorize`, `/authorize/callback`, `/token`, `/register`) are separate from the existing GitHub OAuth endpoints (`/auth/github/login`, `/auth/github/callback`).

**Why**: They serve different purposes:
- Existing endpoints: direct browser-based login, returns JWT to the browser
- MCP endpoints: proxy OAuth flow, redirects to MCP client's callback URL with an authorization code

They share the same `OAuthConfig` (GitHub client ID/secret) and `SessionManager` (JWT issuance), but the flow logic is different. Keeping them separate avoids fragile conditional branching.

### Token Exchange Endpoint

**Decision**: Add `POST /auth/token` on the server that accepts `{"github_token": "gho_..."}` and returns a session JWT. This endpoint validates the GitHub token by calling `GET https://api.github.com/user`, creates a session, and returns a JWT — identical to what the OAuth callback does.

**Why**: The Device Flow produces a GitHub token on the client side. The client needs a way to trade this for a server session. The same endpoint handles GitHub PATs. The alternative (having the client use the GitHub token directly as a bearer token) would require the server to validate against GitHub on every request and lose session-based features.

### Built-in OAuth App for Device Flow

**Decision**: Register a single GitHub OAuth App under the `emergent-company` org with Device Flow enabled. Ship its client ID in the binary. Device Flow does not require a client secret.

**Why**: GitHub Device Flow is designed for CLI tools that cannot receive HTTP callbacks. The `gh` CLI, OpenCode, and `gcloud` all use this pattern. The client ID is public by design. Users authenticate in their browser and the CLI polls for completion.

**Alternative considered**: Require each server deployer to register an OAuth App and pass the client ID via env var. Rejected — this is the current multi-tenant flow and creates unnecessary friction for CLI users.

### Connect TUI Flow

**Decision**: `epf-cli connect <server-url>` runs an interactive Bubble Tea TUI with the following screens:

1. **Connect** — shows server URL, checks `/health`, displays server info (mode, version)
2. **Authenticate** — if not already authenticated, shows auth method selection and executes the chosen flow
3. **Workspaces** — calls `/workspaces`, displays list with arrow-key navigation
4. **Selected** — shows instance details (feature count, OKR count), MCP config snippet, copy-to-clipboard

The authenticate screen offers three methods:

- **Login with GitHub** (Device Flow) — recommended, zero-config
- **Paste a GitHub Personal Access Token** — for users who already have a PAT
- **Paste an existing server token** (JWT) — for users who authenticated via browser OAuth

All three methods result in a valid server session JWT stored in the local credential store.

**Why**: Bubble Tea v2's Elm Architecture makes each screen a pure function (Model → Update → View). The flow maps directly to the user's mental model: "connect to server → log in → pick workspace → get config."

### Token Storage

**Decision**: Store credentials in `~/.config/epf-cli/auth.json` keyed by server URL:

```json
{
  "servers": {
    "https://epf.emergent.so": {
      "token": "eyJ...",
      "username": "nikolai",
      "user_id": 12345,
      "instance_path": "emergent-company/emergent-epf",
      "authenticated_at": "2026-03-03T12:00:00Z"
    }
  }
}
```

**Why**: Simple, human-readable, one file. The `instance_path` is stored so subsequent `connect` calls can skip workspace selection. File permissions are set to 0600. Same pattern as `~/.config/gh/hosts.yml`.

### Headless Login Command

**Decision**: `epf-cli login --server <url>` runs the Device Flow without a TUI. It prints the verification code and URL to stderr, polls for completion, exchanges the token, and stores it. This is the non-interactive path for CI or users who prefer plain output.

**Why**: Not all environments support a TUI (CI, piped output, minimal containers). The login command provides the same auth capability without Bubble Tea.

## Risks / Trade-offs

- **MCP OAuth complexity**: Adding a full OAuth authorization server is the most complex part of this change. However, it's built on well-defined RFCs and the existing auth infrastructure (session manager, GitHub OAuth config). The endpoints are stateless except for in-memory maps (DCR clients, authorization codes) with TTL expiry.
- **Spec compliance surface area**: The MCP Authorization Spec references RFC 8414, RFC 7591, RFC 9728, RFC 8707, and OAuth 2.1. We implement the minimum viable subset: metadata discovery, DCR (public clients only), authorization code + PKCE, bearer tokens. We skip: confidential clients, token refresh, scope negotiation, JWT-based access tokens (we use our existing HMAC JWT).
- **New dependency (Bubble Tea v2)**: Adds ~3 Go module dependencies and ~2-3MB to binary. Bubble Tea is mature (40k stars, backed by Charm). No runtime impact on other commands.
- **Device Flow client ID in binary**: Public by design. GitHub Device Flow does not require a secret. Rate limits apply per-user, not per-app.
- **Token stored in plaintext**: `~/.config/epf-cli/auth.json` is readable by the current user only (0600). Same security model as `gh`, `gcloud`, `aws` CLI tools. Keychain integration can be added later.
- **In-memory DCR and authorization code storage**: Lost on server restart. This is fine — MCP clients re-register and re-authorize automatically. Production deployments that need persistence can add it later.

## Open Questions

- Should `connect` offer to write the MCP config directly into `opencode.jsonc` / `.cursor/mcp.json` if detected?
- Should the workspace list show a "refresh" option, or is the cached list sufficient?
- Should we implement `resource` parameter validation (RFC 8707) from day one, or defer? (The spec says clients MUST send it, but servers can ignore it initially.)
