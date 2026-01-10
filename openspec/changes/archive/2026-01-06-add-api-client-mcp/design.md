## Context

AI coding agents need to call API endpoints during development and testing. Currently this requires:

1. Manually acquiring OAuth tokens from Zitadel
2. Crafting curl commands with proper headers
3. Parsing JSON responses

This is time-consuming and error-prone. An MCP server can automate the authentication and provide structured API access.

### Stakeholders

- AI coding agents (OpenCode, Cursor)
- Developers debugging API issues

### Constraints

- Must use existing `TEST_USER_EMAIL`/`TEST_USER_PASSWORD` credentials from `.env`
- Must work with Zitadel password grant flow
- Should read endpoint definitions from existing `openapi.yaml`

## Goals / Non-Goals

### Goals

- Zero authentication burden on the agent (transparent token management)
- Single tool call to invoke any API endpoint
- Discover available endpoints without reading code
- Support all HTTP methods (GET, POST, PUT, PATCH, DELETE)

### Non-Goals

- Generic OpenAPI client (this is Emergent-specific)
- File upload support (complex, defer to future)
- WebSocket/SSE support (defer to future)
- Support for non-JSON request/response bodies

## Decisions

### Decision 1: Password Grant Flow for Authentication

**What:** Use OAuth 2.0 Resource Owner Password Credentials (ROPC) grant to obtain tokens.

**Why:**

- Test users have credentials stored in `.env`
- Simpler than JWT Bearer grant (no service account key management)
- Matches how developers manually test with the test user

**Implementation:**

```typescript
const tokenUrl = `${ZITADEL_ISSUER}/oauth/v2/token`;
const params = new URLSearchParams({
  grant_type: 'password',
  client_id: ZITADEL_CLIENT_ID,
  username: TEST_USER_EMAIL,
  password: TEST_USER_PASSWORD,
  scope: 'openid profile email offline_access',
});
```

**Alternatives considered:**

- JWT Bearer grant (scripts/get-access-token.mjs): Requires service account JSON file
- Client credentials grant: Would need separate machine client, loses user context

### Decision 2: OpenAPI Spec as Source of Truth

**What:** Parse `openapi.yaml` at startup to build endpoint registry.

**Why:**

- Already maintained and up-to-date
- Contains method, path, parameters, request/response schemas
- Single source of truth for API contract

**Implementation:**

- Use `yaml` package to parse spec
- Extract paths, operations, parameters, requestBody schemas
- Build searchable index for `list_endpoints` tool

**Alternatives considered:**

- Hardcode endpoints: Drift from actual API, maintenance burden
- Scan controller files: Complex, incomplete information

### Decision 3: Token Caching with Expiry Check

**What:** Cache tokens in memory, refresh when expired or about to expire.

**Why:**

- Avoid token request on every API call
- Tokens typically valid for 1 hour
- Refresh 5 minutes before expiry for smooth operation

**Implementation:**

```typescript
interface TokenCache {
  accessToken: string;
  expiresAt: number; // Unix timestamp
  refreshToken?: string;
}

function isTokenValid(cache: TokenCache): boolean {
  return cache.expiresAt > Date.now() / 1000 + 300; // 5 min buffer
}
```

### Decision 4: MCP Server Tool Design

**What:** Two tools - `list_endpoints` and `call_api`.

**Tool: list_endpoints**

- Input: `{ filter?: string }` - optional search filter
- Output: Array of `{ method, path, summary, description, operationId }`
- Use case: Discovery, finding the right endpoint

**Tool: call_api**

- Input: `{ method, path, body?, queryParams?, pathParams? }`
- Output: `{ status, headers, body }` or error details
- Use case: Actually calling the endpoint

**Why two tools:**

- Separation of concerns
- `list_endpoints` is cheap (no network call)
- Agent can search before calling

## Risks / Trade-offs

### Risk: Password Grant Deprecation

- **Risk:** ROPC grant is deprecated in OAuth 2.1
- **Mitigation:** Zitadel still supports it; revisit if/when upgrading auth

### Risk: Credential Exposure

- **Risk:** Credentials in environment variables
- **Mitigation:** Development only; use `.env.local` not committed to git

### Risk: Token Refresh Race Condition

- **Risk:** Multiple concurrent calls might all try to refresh
- **Mitigation:** Mutex/lock around refresh logic

### Trade-off: No File Upload

- **Decision:** Skip file upload support initially
- **Rationale:** Complex multipart handling, can add later
- **Impact:** Can't test document upload via MCP (use browser instead)

## Migration Plan

No migration needed - this is a new capability.

### Rollout Steps

1. Implement MCP server in `tools/api-client-mcp/`
2. Add OpenCode agent configuration
3. Register in `opencode.jsonc`
4. Document usage in `.opencode/instructions.md`

### Rollback

Remove MCP server registration from `opencode.jsonc`.

## Open Questions

1. **Should we support custom credentials?** Currently hardcoded to TEST_USER. Could add tool parameter to override.
2. **Rate limiting?** Should we add delays between API calls to avoid overwhelming the server?
