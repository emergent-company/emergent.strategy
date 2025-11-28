## API Scopes

Fine‑grained OAuth style scopes gate every protected operation. Endpoints declare their required scopes in the OpenAPI `x-required-scopes` extension and return `403` with a `missing_scopes` array when absent.

| Scope           | Purpose                            | Typical Operations                                                   |
| --------------- | ---------------------------------- | -------------------------------------------------------------------- |
| read:me         | Read current user profile (mock)   | `GET /auth/me`                                                       |
| documents:read  | List / fetch documents             | `GET /documents`, `GET /documents/{id}`                              |
| documents:write | Create / delete documents          | `POST /documents`, `DELETE /documents/{id}`                          |
| ingest:write    | Ingest new source content          | `POST /ingest/upload`, `POST /ingest/url`                            |
| chunks:read     | List content chunks                | `GET /chunks`                                                        |
| search:read     | Perform semantic / lexical search  | `GET /search`                                                        |
| chat:read       | Read / stream chat conversations   | `GET /chat/conversations`, `GET /chat/{id}`, `GET /chat/{id}/stream` |
| chat:write      | Create / mutate chat conversations | `POST /chat/conversations`, `PATCH /chat/{id}`, `DELETE /chat/{id}`  |
| **schema:read** | **View MCP schema metadata**       | `GET /mcp/schema/version`, `GET /mcp/schema/changelog`               |
| **data:read**   | **Query graph objects via MCP**    | `GET /mcp/data/query` (future)                                       |
| **data:write**  | **Mutate graph objects via MCP**   | `POST /mcp/data/create`, `PUT /mcp/data/update` (future)             |
| **mcp:admin**   | **MCP administrative operations**  | Admin endpoints (future)                                             |

### Error Shape

```
HTTP 403
{
  "error": {
    "code": "forbidden",
    "message": "Forbidden",
    "missing_scopes": ["documents:read"]
  }
}
```

### Notes

- Scope comparison is case‑insensitive.
- A single missing scope blocks the entire operation (AND logic for multi-scope endpoints).
- SSE streaming endpoints (`/chat/{id}/stream`) perform the scope check before emitting any frames.
- When expanding the model add the constant to `MOCK_SCOPES` in `apps/server/src/modules/auth/auth.service.ts` and decorate controller methods with `@Scopes(...)`.
- OpenAPI is code‑generated; ensure you rebuild (`npm run build` inside `apps/server`) so tests referencing compiled dist pick up new decorators.

---

## MCP (Model Context Protocol) Scopes

The MCP module provides AI agents with structured access to the knowledge graph through authenticated API endpoints. All MCP operations require JWT bearer tokens with appropriate scopes.

### MCP Scope Model

| Scope         | Access Level     | Purpose                                                 | Status         |
| ------------- | ---------------- | ------------------------------------------------------- | -------------- |
| `schema:read` | Schema Discovery | View template packs, types, relationships, version info | ✅ Implemented |
| `data:read`   | Data Queries     | Query graph objects, traverse relationships             | 🚧 Future      |
| `data:write`  | Data Mutations   | Create, update, delete graph objects                    | 🚧 Future      |
| `mcp:admin`   | Administration   | Schema modifications, administrative operations         | 🚧 Future      |

**Current Implementation** (Phase 4):

- ✅ `schema:read` - Required for all current MCP endpoints
- 🚧 `data:*` - Reserved for future data tool implementation
- 🚧 `mcp:admin` - Reserved for future admin operations

### Scope Hierarchy

**Note**: Current implementation uses a **flat scope model** with no automatic inheritance. Future enhancements may add scope hierarchy where higher-level scopes grant lower-level access.

**Example of Potential Hierarchy** (not yet implemented):

```
mcp:admin → grants: schema:read, data:read, data:write
data:write → grants: data:read, schema:read
data:read → grants: schema:read
```

Until hierarchy is implemented, tokens must explicitly include all required scopes.

### Protected MCP Endpoints

#### Schema Discovery (Implemented)

| Endpoint                | Method | Required Scope | Purpose                                       |
| ----------------------- | ------ | -------------- | --------------------------------------------- |
| `/mcp/schema/version`   | GET    | `schema:read`  | Get current schema version hash and timestamp |
| `/mcp/schema/changelog` | GET    | `schema:read`  | Get schema change history with pagination     |

#### Data Operations (Future)

| Endpoint             | Method | Required Scope | Purpose                                    |
| -------------------- | ------ | -------------- | ------------------------------------------ |
| `/mcp/data/query`    | GET    | `data:read`    | Query graph objects by type/filters        |
| `/mcp/data/traverse` | POST   | `data:read`    | Traverse relationships from starting nodes |
| `/mcp/data/create`   | POST   | `data:write`   | Create new graph objects                   |
| `/mcp/data/update`   | PUT    | `data:write`   | Update existing graph objects              |
| `/mcp/data/delete`   | DELETE | `data:write`   | Delete graph objects                       |

### MCP Token Examples

#### Test Tokens (Mock Environment)

Available mock tokens for E2E testing:

| Token Name          | Scopes                                   | Use Case                       |
| ------------------- | ---------------------------------------- | ------------------------------ |
| `schema-read-token` | `schema:read`                            | Basic schema discovery only    |
| `data-read-token`   | `schema:read`, `data:read`               | Schema + data queries          |
| `data-write-token`  | `schema:read`, `data:read`, `data:write` | Full data access               |
| `mcp-admin-token`   | `mcp:admin`                              | Administrative operations only |
| `e2e-all`           | All scopes                               | Complete system access         |

#### Production Tokens

Production JWT tokens must include MCP scopes in the claims:

```json
{
  "sub": "ai-agent-12345",
  "iss": "https://auth.example.com",
  "aud": "api.example.com",
  "exp": 1729468800,
  "scp": ["schema:read", "data:read"],
  "permissions": "schema:read,data:read"
}
```

**Supported Claim Formats**:

- `scp` (array): `["schema:read", "data:read"]`
- `scp` (string): `"schema:read data:read"`
- `permissions` (CSV): `"schema:read,data:read"`

### AI Agent Configuration

#### Claude Desktop Example

Configure Claude Desktop to use MCP with bearer token:

```json
{
  "mcpServers": {
    "spec-server": {
      "url": "https://api.example.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN_HERE"
      }
    }
  }
}
```

**Required Token Scopes**: At minimum `schema:read` for schema discovery.

#### Cursor IDE Example

```json
{
  "mcp": {
    "servers": {
      "spec-server": {
        "command": "npx",
        "args": [
          "-y",
          "@modelcontextprotocol/cli",
          "connect",
          "https://api.example.com/mcp"
        ],
        "env": {
          "MCP_AUTH_TOKEN": "YOUR_TOKEN_HERE"
        }
      }
    }
  }
}
```

### Error Responses

#### Missing Token (401 Unauthorized)

```bash
curl http://localhost:3001/mcp/schema/version
```

```json
{
  "error": {
    "code": "unauthorized",
    "message": "Missing Authorization bearer token"
  }
}
```

#### Invalid Token (401 Unauthorized)

```bash
curl -H "Authorization: Bearer invalid-token-12345" \
  http://localhost:3001/mcp/schema/version
```

```json
{
  "error": {
    "code": "unauthorized",
    "message": "Invalid token"
  }
}
```

#### Missing Scope (403 Forbidden)

```bash
curl -H "Authorization: Bearer no-scope" \
  http://localhost:3001/mcp/schema/version
```

```json
{
  "error": {
    "code": "forbidden",
    "message": "Insufficient permissions",
    "details": {
      "required": ["schema:read"],
      "provided": [],
      "missing": ["schema:read"]
    }
  }
}
```

### Debug Mode

Enable debug headers to troubleshoot authorization issues:

```bash
DEBUG_AUTH_SCOPES=1 curl -H "Authorization: Bearer schema-read-token" \
  http://localhost:3001/mcp/schema/version
```

**Response includes**:

```
X-Auth-User-Id: 12345678-1234-5678-1234-567812345678
X-Auth-Scopes: schema:read
```

When forbidden (403), includes:

```
X-Auth-Missing-Scopes: data:read,data:write
```

### Best Practices

1. **Principle of Least Privilege**: Grant only the minimum scopes needed

   - AI agents reading schema: `schema:read` only
   - AI agents querying data: `schema:read`, `data:read`
   - AI agents modifying data: `schema:read`, `data:read`, `data:write`

2. **Token Rotation**: Rotate MCP tokens regularly (recommend: 30-90 days)

3. **Audit Logging**: All MCP operations are logged via `AuditService` including:

   - User/agent identifier
   - Requested endpoint
   - Required vs provided scopes
   - Authorization decision (granted/denied)

4. **Rate Limiting**: Consider implementing per-token rate limits for MCP endpoints

5. **Scope Validation**: Always check token scopes match operational requirements before deployment

### Testing

Comprehensive E2E tests validate MCP authentication:

- 25 tests covering authentication, authorization, response structure
- Tests use mock tokens with various scope combinations
- 100% pass rate achieved

Run tests:

```bash
cd apps/server
npm run test:e2e -- tests/e2e/mcp-auth.e2e.spec.ts
```

### Related Documentation

- [MCP Phase 4 Complete](./docs/MCP_PHASE4_AUTH_COMPLETE.md) - Implementation details
- [MCP Testing Complete](./docs/MCP_TESTING_COMPLETE.md) - Unit test coverage
- [Auth System](./docs/AUTH_SYSTEM.md) - Overall authentication architecture
