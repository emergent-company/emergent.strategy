## Changelog

### 2025-09-07
- Removed Passkey / WebAuthn custom flow (frontend helpers, backend routes, env vars). Consolidated on Zitadel hosted OIDC only.
- Stubbed then scheduled deletion of legacy `src/zitadel/passwordless.ts` (no runtime imports remain).
- Added tombstone note in `spec/15-passkey-auth.md`.

### 2025-08 (Earlier)
- Initial ingestion server, embeddings, Zitadel OIDC integration.