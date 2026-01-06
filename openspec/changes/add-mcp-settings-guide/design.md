## Context

Users want to connect external AI agents to Emergent's MCP server. The MCP server already exists at `POST /mcp/rpc` with Bearer token authentication (currently Zitadel JWTs). This change adds:

1. A UI guide showing how to configure agents
2. API token generation for programmatic access without requiring OAuth flows

### Stakeholders

- End users configuring AI agents
- AI agents (Claude Desktop, Cursor, Cline, OpenCode)
- Backend authentication system

### Constraints

- Must work with existing AuthGuard/ScopesGuard infrastructure
- Tokens must be project-scoped (users may have multiple projects)
- Token secrets must be shown only once at creation (security best practice)

## Goals / Non-Goals

**Goals:**

- Enable users to configure external AI agents with minimal friction
- Provide secure, revocable API tokens
- Support the most popular AI agent configurations

**Non-Goals:**

- OAuth device flow (future enhancement)
- Token usage analytics/rate limiting (future enhancement)
- Cross-project tokens (tokens are project-scoped)

## Decisions

### Decision 1: API Token Storage

**What:** Store API tokens in a new `core.api_tokens` table with hashed token values.

**Why:**

- Follows security best practices (tokens stored as SHA-256 hashes)
- Allows token validation without exposing raw values
- Prefix format (`emt_`) allows quick identification of token type

**Alternatives considered:**

- Store in Zitadel as machine users: More complex, requires Zitadel admin access
- Use existing JWT refresh tokens: Not designed for programmatic access

### Decision 2: Token Format

**What:** Tokens use format `emt_<32-byte-random-hex>` (e.g., `emt_a1b2c3d4...`)

**Why:**

- Prefix identifies Emergent tokens vs other credentials
- 32 bytes (256 bits) provides sufficient entropy
- Hex encoding is URL-safe and easy to copy

### Decision 3: Token Validation Path

**What:** Add token validation to existing `AuthService.validateToken()` method.

**Why:**

- Single authentication entry point
- Existing guards (AuthGuard, ScopesGuard) work without modification
- Token validation checked before JWT validation for efficiency

**Flow:**

1. Check if token matches `emt_*` pattern
2. Hash token and lookup in `api_tokens` table
3. Verify token is not revoked and belongs to active project
4. Return AuthUser with token's scopes and project context

### Decision 4: Scope Mapping

**What:** API tokens have explicit scopes stored in the database.

| UI Permission | Scopes Granted                           |
| ------------- | ---------------------------------------- |
| Read Schema   | `schema:read`                            |
| Read Data     | `schema:read`, `data:read`               |
| Write Data    | `schema:read`, `data:read`, `data:write` |

**Why:**

- Principle of least privilege
- Users can create read-only tokens for monitoring agents
- Write tokens required only for agents that modify data

## Database Schema

```sql
CREATE TABLE core.api_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES core.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES core.user_profiles(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  token_hash VARCHAR(64) NOT NULL UNIQUE,  -- SHA-256 hex
  token_prefix VARCHAR(12) NOT NULL,        -- First 8 chars for identification
  scopes TEXT[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,

  CONSTRAINT api_tokens_project_name_unique UNIQUE (project_id, name)
);

CREATE INDEX idx_api_tokens_token_hash ON core.api_tokens(token_hash);
CREATE INDEX idx_api_tokens_project_id ON core.api_tokens(project_id);
```

## Risks / Trade-offs

| Risk                 | Mitigation                                                                          |
| -------------------- | ----------------------------------------------------------------------------------- |
| Token leaked in logs | Prefix-only display after creation, never log full token                            |
| Token brute force    | Rate limiting on auth endpoints (existing), 256-bit entropy                         |
| Stale tokens         | Tokens inherit user's project membership; if user removed from project, token fails |
| Token sprawl         | UI shows last_used_at to help identify unused tokens                                |

## Open Questions

1. Should tokens have expiration dates? (Current decision: No, revocation is sufficient)
2. Should we support IP allowlists for tokens? (Future enhancement)
3. Maximum tokens per project? (Suggest: 50, can be increased)
