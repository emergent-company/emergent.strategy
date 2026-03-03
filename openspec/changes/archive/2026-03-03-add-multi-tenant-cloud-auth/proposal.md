# Change: Add Multi-Tenant User Authentication and Workspace Discovery

## Why

The EPF Cloud Server (Stage 1, shipped) runs as a single-tenant deployment: one container serves one EPF instance, configured at startup via environment variables. There is no user identity — authentication is handled by Cloud Run IAM. To evolve into a Strategy-as-a-Service platform where multiple users can log in with their GitHub accounts, discover their EPF repositories, and dynamically switch between strategy workspaces, the server needs user authentication, workspace discovery, and per-user instance routing.

This is Stage 2 of the cloud server evolution, directly enabling `kr-p-008` (AI Strategy Platform MVP with subscription billing, session management, multi-workspace for 10 beta users) and the `UserAuthentication`, `WorkspaceDiscovery`, and `AccessGating` components in the value model.

## What Changes

- **BREAKING**: The `epf-strategy-server` spec gains user-facing authentication requirements (GitHub OAuth) alongside the existing GitHub App server-to-server auth
- Add GitHub OAuth 2.0 flow for user identity and repository permission discovery
- Add workspace discovery — users see which of their GitHub repos/orgs contain EPF instances
- Add dynamic instance routing — per-request resolution of `instance_path` to a user-authorized GitHub repository
- Add per-user session management with bearer token authentication on the HTTPS transport
- Retain GitHub App as an optional accelerator (better rate limits, org-wide installation) when available
- Add access control enforcement — users can only query repositories they have GitHub access to
- Existing single-tenant deployment mode (env var config, no OAuth) continues to work unchanged

## Impact

- Affected specs: `epf-strategy-server` (modified: Strategy Store Interface, CLI Commands; added: User Authentication, Workspace Discovery, Dynamic Instance Routing, Access Control)
- Affected code: `apps/epf-cli/internal/auth/` (new OAuth module alongside existing GitHub App auth), `apps/epf-cli/internal/source/` (multi-instance source resolution), `apps/epf-cli/cmd/serve.go` (OAuth config, session middleware), `apps/epf-cli/internal/transport/http.go` (bearer token auth middleware)
- New external dependency: GitHub OAuth 2.0 (application registration required)
- Existing local CLI and single-tenant cloud behavior preserved — multi-tenant is opt-in via OAuth configuration

## Relationship to Other Changes

- **Extends** `add-epf-cloud-server` (archived) — builds on the Source interface, HTTPS transport, and GitHub App auth shipped in Stage 1
- **Enables** `add-emergent-ai-strategy` — AI agent sessions need per-user workspace scoping to query the right strategy context
- **Enables** `kr-p-008` — the AI Strategy Platform MVP requires multi-workspace, session management, and subscription billing (billing is out of scope for this change)
- **Activates** value model components: `Product.EPFCloudStrategyServer.UserAuthentication`, `WorkspaceDiscovery`, `AccessGating`

## Deployment Model

This change supports both deployment modes:

1. **Self-hosted (team)**: Deploy for your own org. Configure GitHub OAuth App + optional GitHub App. All users must belong to the org.
2. **Hosted SaaS (e.g., `epf.emergent.so`)**: Run as a multi-tenant service. Any GitHub user can sign in and access repos they have permission for. GitHub App installation is optional per org.
