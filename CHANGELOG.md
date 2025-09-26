## Changelog

## [Unreleased]
### Added
- Graph traversal: expanded E2E coverage (direction in/out/both, multi-root dedupe, truncation, filtering) for `POST /graph/traverse`.
- Documentation: Updated `spec/19-dynamic-object-graph.md` with current minimal traversal API (`/graph/traverse`) vs planned `/graph/expand` comparison.


### Added
- Database readiness interceptor returning 503 `upstream-unavailable` when DB reachable but schema incomplete.
- UUID route param validation pipe converting invalid UUIDs to 400 `bad-request` instead of 500 errors.

### Changed
- Tightened `SKIP_DB` semantics: only explicit `true`/`1` values honored to prevent accidental schema skips.
- Standardized validation error envelope across endpoints: `{ error: { code: 'validation-failed', message, details } }`.
- E2E minimal schema path now includes lightweight upgrade pass to create newly introduced membership tables without full drop.
- Ingestion edge cases now map to structured 4xx codes instead of generic 500s.

### Removed
- Temporary self-healing membership table creation logic from `PermissionService` after stabilizing deterministic schema upgrade path.

### Fixed
- Missing membership table errors (42P01) under `E2E_MINIMAL_DB` re-run path resolved via upgrade + ensured extension ordering.
- User profile phone validation test aligned with standardized error envelope (no reliance on deprecated top-level `message`).

### 2025-09-07
- Removed Passkey / WebAuthn custom flow (frontend helpers, backend routes, env vars). Consolidated on Zitadel hosted OIDC only.
- Stubbed then scheduled deletion of legacy `src/zitadel/passwordless.ts` (no runtime imports remain).
- Added tombstone note in `spec/15-passkey-auth.md`.

### 2025-08 (Earlier)
- Initial ingestion server, embeddings, Zitadel OIDC integration.