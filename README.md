# Spec Server

Minimal ingestion server aligned with the spec:
- Ingest a URL or uploaded file, extract text, chunk, embed with Google Gemini `text-embedding-004`.
- Store in Postgres with pgvector and FTS.

See `SETUP.md` for end-to-end local setup (DB, Zitadel auth, API server, Admin SPA) and `RUNBOOK.md` for operational details.

## Authentication

The system now uses only standard OIDC flows via Zitadel's hosted UI. Previous experimental Passkey / WebAuthn endpoints and helpers were removed (2025-09) to reduce surface area. The deprecated spec document (`spec/15-passkey-auth.md`) is retained only as a short tombstone note. No passwordless-specific environment variables are required anymore.

## Reference projects

We keep UI/UX reference code as Git submodules under `reference/` (read-only, no runtime imports).

- Add Nexus (once):
	- git submodule add -b master git@github.com:eyedea-io/Nexus-React-3.0.0.git reference/nexus
- Initialize/update on fresh clones:
	- git submodule update --init --recursive
- Pull latest from upstream:
	- git -C reference/nexus pull origin master

Never import from `reference/` at runtime. Copy patterns into `apps/admin/src/**` with strict TS and our lint/style.

## Changelog

See `CHANGELOG.md` for notable removals and additions.
