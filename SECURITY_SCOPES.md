## API Scopes

Fine‑grained OAuth style scopes gate every protected operation. Endpoints declare their required scopes in the OpenAPI `x-required-scopes` extension and return `403` with a `missing_scopes` array when absent.

| Scope | Purpose | Typical Operations |
|-------|---------|--------------------|
| read:me | Read current user profile (mock) | `GET /auth/me` |
| documents:read | List / fetch documents | `GET /documents`, `GET /documents/{id}` |
| documents:write | Create / delete documents | `POST /documents`, `DELETE /documents/{id}` |
| ingest:write | Ingest new source content | `POST /ingest/upload`, `POST /ingest/url` |
| chunks:read | List content chunks | `GET /chunks` |
| search:read | Perform semantic / lexical search | `GET /search` |
| chat:read | Read / stream chat conversations | `GET /chat/conversations`, `GET /chat/{id}`, `GET /chat/{id}/stream` |
| chat:write | Create / mutate chat conversations | `POST /chat/conversations`, `PATCH /chat/{id}`, `DELETE /chat/{id}` |

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

* Scope comparison is case‑insensitive.
* A single missing scope blocks the entire operation (AND logic for multi-scope endpoints).
* SSE streaming endpoints (`/chat/{id}/stream`) perform the scope check before emitting any frames.
* When expanding the model add the constant to `MOCK_SCOPES` in `apps/server-nest/src/modules/auth/auth.service.ts` and decorate controller methods with `@Scopes(...)`.
* OpenAPI is code‑generated; ensure you rebuild (`npm run build` inside `apps/server-nest`) so tests referencing compiled dist pick up new decorators.
