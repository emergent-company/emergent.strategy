# Server (NestJS)

This service provides the API (NestJS) layer for org/project management, documents, ingestion, chat, search, and invitations.

## Scripts

Common development / test scripts (run from repo root or from this directory):

- Build: `npm --prefix apps/server-nest run build`
- OpenAPI generate: `npm --prefix apps/server-nest run gen:openapi`
- Unit tests: `npm --prefix apps/server-nest test`
- E2E tests: `npm --prefix apps/server-nest test:e2e`
- Scenario test(s): `RUN_SCENARIOS=1 npm --prefix apps/server-nest run test:scenarios`

### Scenario Tests

Scenario specs (in `tests/scenarios/`) are heavier end‑to‑end flows (provision org & project, ingest, chat stream, citations). They are skipped by default to keep CI fast. Enable them explicitly:

```bash
RUN_SCENARIOS=1 npm --prefix apps/server-nest run test:scenarios
```

Optional flags:
- `SCENARIO_DEBUG=1` – extra logging
- `GOOGLE_API_KEY=<key>` & `CHAT_MODEL_ENABLED=true` – exercise real model path; otherwise synthetic token streaming is used

### Environment Files

Sample env for scenario runs: `.env.e2e.scenarios.example` (copy to `.env.e2e.scenarios` or export vars).

Key vars:
- `CHAT_MODEL_ENABLED` – toggle real model usage
- `GOOGLE_API_KEY` – if set with model enabled, responses stream actual model output
- `DEBUG_AUTH_SCOPES=1` – adds debug headers for scope resolution

### Authorization Overview

Roles (org/project membership) are resolved to scopes server‑side; test tokens can grant full scope set (`e2e-all`) or minimal (`with-scope`). Guard enforces required scopes on annotated handlers.

### Cascades & Atomic Inserts

See `README.cte-cascade.md` for details on ON DELETE CASCADE strategy and guarded CTE insert pattern preventing race conditions.

### OpenAPI Regression Guard

A hash test locks path+tag structure. After intentional spec changes, update the expected hash in the regression test. Regenerate spec with `npm --prefix apps/server-nest run gen:openapi`.

### Troubleshooting

- Missing scenario tests: ensure `RUN_SCENARIOS=1` is set.
- Scope 403s when expecting allow: confirm token variant (`authHeader('all', ...)`) and required header context (`x-project-id`, `x-org-id`).
- Chat streaming empty: check `CHAT_MODEL_ENABLED` and key presence; otherwise synthetic tokens are expected.

---
*See root `SETUP.md` for full repository bootstrap instructions.*
