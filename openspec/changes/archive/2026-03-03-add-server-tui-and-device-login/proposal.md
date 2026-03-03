# Change: Add MCP-Native OAuth, Interactive Client TUI, and Device Flow Login

## Why

Connecting an AI tool to a remote EPF cloud server requires different integration paths depending on the tool:

- **Cloud AI tools** (Claude Cowork, OpenCode with OAuth, Cursor) expect the MCP server to implement the MCP Authorization Spec — OAuth 2.1 with Protected Resource Metadata, Dynamic Client Registration, and authorization code flow. Without this, these tools cannot connect at all.
- **Terminal-based AI tools** (OpenCode, Cursor via config) can use a bearer token in their MCP config, but the user needs a guided flow to authenticate, discover workspaces, and get the right config snippet.
- **CI/scripting** needs headless auth without interactive prompts.

The current server has GitHub OAuth for browser-based clients (`/auth/github/login` → callback → JWT), but this doesn't satisfy any of the three paths above. Cloud AI tools need MCP-spec OAuth endpoints. Terminal users need a guided TUI. CI needs a non-interactive login command.

## What Changes

### Server-side: MCP-native OAuth Authorization Server

- Implement the MCP Authorization Spec (2025-06-18) so the EPF server acts as both an OAuth authorization server (to MCP clients) and an OAuth client (to GitHub) — the Third-Party Authorization Flow
- Add `GET /.well-known/oauth-protected-resource` — Protected Resource Metadata (RFC 9728) pointing to the authorization server
- Add `GET /.well-known/oauth-authorization-server` — Authorization Server Metadata (RFC 8414)
- Add `POST /register` — Dynamic Client Registration (RFC 7591) for MCP clients like Claude
- Add `GET /authorize` — OAuth authorization endpoint that redirects to GitHub OAuth consent
- Add `POST /token` — OAuth token endpoint that exchanges authorization codes for access tokens
- Add authorization code storage (in-memory with expiry, same pattern as existing CSRF state map)
- Support PKCE (code_challenge/code_verifier) as required by OAuth 2.1
- The existing OAuth flow (`/auth/github/login` + `/auth/github/callback`) remains for direct browser use

### Server-side: Token Exchange Endpoint

- Add `POST /auth/token` endpoint that accepts a GitHub access token (from Device Flow or PAT) and returns a server session JWT — for CLI-based auth flows

### Client-side: Connect TUI

- Add `epf-cli connect <server-url>` command with an interactive TUI (Bubble Tea v2) that walks the user through authentication, workspace discovery, and instance selection
- Three auth methods on the authenticate screen: Device Flow (recommended), paste GitHub PAT, paste existing JWT
- Outputs a ready-to-paste MCP config snippet for the user's AI tool

### Client-side: Login Command and Token Storage

- Add `epf-cli login` command implementing GitHub Device Flow for zero-config headless authentication
- Ship a built-in OAuth App client ID in the binary (Device Flow does not require a client secret)
- Add local token storage (`~/.config/epf-cli/auth.json`) so credentials persist across sessions

### New dependencies

- `charm.land/bubbletea/v2`, `charm.land/bubbles/v2`, `charm.land/lipgloss/v2` (client TUI only, adds ~2-3MB to binary, no runtime impact on other commands)

## Impact

- Affected specs: `epf-strategy-server` (added: MCP OAuth Authorization Server, Token Exchange Endpoint), `epf-cli-auth` (added: Connect TUI, Device Flow Login, Token Storage)
- Affected code: `apps/epf-cli/internal/auth/` (new OAuth server endpoints, device flow client, token store), `apps/epf-cli/internal/tui/connect/` (new TUI package), `apps/epf-cli/cmd/connect.go` + `cmd/login.go` (new commands), `apps/epf-cli/internal/transport/http.go` (route registration)
- Existing server behavior unchanged — MCP OAuth endpoints are additive, existing `/auth/github/*` routes remain

## Relationship to Other Changes

- **Extends** `add-multi-tenant-cloud-auth` (archived) — adds MCP-native OAuth as the standards-based auth layer, Device Flow as a CLI auth entry point, and the connect TUI as a client-side onboarding experience
- **Enables** zero-config connection from Claude Cowork, OpenCode, Cursor — users add the server URL and authorize via browser, no CLI interaction needed
- **Enables** self-hosted deployments without OAuth App registration — solo developers can use `epf-cli connect` with Device Flow
