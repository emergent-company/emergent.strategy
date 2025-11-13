# Server (Nest) End-to-End Testing Spec

## Goal
Establish a deterministic, DB‑backed E2E test layer for `apps/server` that exercises real HTTP routes against a running Nest application instance with a real PostgreSQL schema, using an actual test user + org + project records. All tests:
- Authenticate with a real JWT (when auth infra available) or controlled fallback token until external IdP wiring is complete.
- Run against an isolated PostgreSQL database schema (or database) seeded once per test session.
- Clean (idempotently) all data owned by the dedicated E2E user between individual test files (suite isolation) while preserving the base org + project objects (unless the test mutates them intentionally).
- Remain fast (< ~8s cold start, < ~2s per typical spec) and parallelizable.

## High-Level Strategy
1. Launch ephemeral Postgres (Docker) or point to a dedicated `spec_e2e` database.
2. Apply schema via existing `DatabaseService.ensureSchema()` (auto-init flag) once.
3. Seed a deterministic test user (logical only for now – since current AuthService mock mode maps tokens -> scopes). When real JWT validation is enabled, mint / cache a test token for that user (via fixture or auth helper script).
4. Seed a primary org + project owned/accessible by the test user. Expose their IDs via a shared test context.
5. Provide utility helpers:
   - `createE2EContext()` – boots Nest app + ensures base fixtures.
   - `truncateUserOwnedData()` – deletes (or cascades) rows in tables referencing the test user's conversations, documents, chunks, chat messages, etc., without dropping org/project base fixtures.
   - `authHeader(scopes?: string[])` – returns Authorization header with appropriate token variant.
6. Vitest config: Tag true E2E specs with `.e2e.spec.ts` suffix; allow running only those via `npm run test:e2e` script.
7. Parallel isolation: Prefer single shared DB with TRUNCATE-in-transaction per worker OR (if data races emerge) provision schema-per-worker using `pg_temp` style namespacing (optional future enhancement).

## Dedicated Test User
- Identifier: `e2e-user-00000000-0000-0000-0000-000000000001` (UUID v4 recommended – can store as text in auth claims `sub`).
- Email: `e2e@test.local`.
- Scopes baseline: `read:me` plus any future required scopes.
- Token Strategy Phase 1 (current mock mode):
  - Reuse existing fallback tokens: map `with-scope` -> user with `read:me` scope.
  - Introduce new token literal `e2e-all` mapping to a superset of scopes for convenience (will modify `AuthService` in follow-up PR).
- Phase 2 (real IdP): Add a lightweight token mint script (Node) hitting the auth provider test tenant.

## Data Cleanup Policy
Between specs (file-level):
- Remove documents, chunks, chat_conversations, chat_messages, settings rows created by the test user or linked to the base project/org.
- Keep org & project stable to avoid churn & flaky foreign key constraints.
Implementation detail: A SQL function or raw TRUNCATE list executed inside a transaction in `afterEach` OR `beforeEach` depending on test semantics. Prefer `beforeEach` for defensive isolation.

Pseudo SQL cleanup:
```sql
DELETE FROM kb.chat_messages WHERE conversation_id IN (SELECT id FROM kb.chat_conversations WHERE owner_user_id = $1);
DELETE FROM kb.chat_conversations WHERE owner_user_id = $1;
DELETE FROM kb.chunks WHERE document_id IN (SELECT id FROM kb.documents WHERE project_id = $2);
DELETE FROM kb.documents WHERE project_id = $2;
-- (Add additional tables as new features come online)
```

## New / Updated Files (Planned)
- `apps/server/tests/e2e/` (folder)
  - `e2e-context.ts` – create app, seed fixtures, expose teardown & cleanup helpers.
  - `auth-helpers.ts` – tokens & headers.
  - `org-project.fixtures.ts` – ensure org + project creation (SQL direct insert + select to avoid service races).
  - Example spec: `documents.create-and-list.e2e.spec.ts`.
- `apps/server/tests/global-setup.e2e.ts` (optional if we want one-off DB/schema setup when running only E2E suite).
- Update `AuthService` (optional follow-up) to recognize `e2e-all` token.
- Add npm script: `"test:e2e": "npm run gen:openapi && vitest run --reporter=dot --passWithNoTests --include=tests/e2e/**/*.e2e.spec.ts"`.
- Add docs section in this spec file (or separate `README-e2e.md`).

## Fixture Boot Flow
1. `createE2EContext()`:
   - Boot via existing `bootstrapTestApp()` but with env overrides: `AUTO_INIT_DB=1`, DB creds target E2E database.
   - Acquire a pg client via `DatabaseService` (expose it out of context or re-create a pool locally with same env vars for raw SQL convenience).
   - Run `ensureBaseFixtures()` to upsert base org & project returning IDs.
2. Provide context object:
```ts
interface E2EContext {
  app: INestApplication;
  baseUrl: string;
  orgId: string;
  projectId: string;
  userSub: string; // constant
  cleanup(): Promise<void>; // per-test cleanup
  close(): Promise<void>; // after all tests
}
```

## Example Spec Sketch
```ts
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { createE2EContext, authHeader } from './e2e-context';

let ctx: E2EContext;

describe('Documents E2E', () => {
  beforeAll(async () => { ctx = await createE2EContext(); });
  beforeEach(async () => { await ctx.cleanup(); });
  afterAll(async () => { await ctx.close(); });

  it('creates & lists documents', async () => {
     const createRes = await fetch(`${ctx.baseUrl}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ filename: 'readme.txt', content: 'Hello', projectId: ctx.projectId })
     });
     expect(createRes.status).toBe(201);
     const listRes = await fetch(`${ctx.baseUrl}/documents?projectId=${ctx.projectId}`, { headers: authHeader() });
     expect(listRes.status).toBe(200);
     const docs = await listRes.json();
     expect(Array.isArray(docs)).toBe(true);
     expect(docs.some((d: any) => d.filename === 'readme.txt')).toBe(true);
  });
});
```

## Parallelization Considerations
Short term: single DB, sequential E2E (set `--maxWorkers=1` for E2E script if flakes appear). Medium term: Add worker suffix to org/project names (e.g., `e2e-org-${workerId}`) so each worker cleans only its own rows.

## Environment Variables
Add (document only; may already exist):
- `AUTO_INIT_DB=1` for automatic schema provisioning.
- `DB_NAME=spec_e2e` (distinct from dev).
- `DB_HOST, DB_PORT, DB_USER, DB_PASSWORD` as per docker-compose or local.

## Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| Cleanup misses a table leading to cross-test leakage | Centralize table list in `cleanup()` + add assertion after each test to ensure zero leftover rows for tracked tables. |
| Slow boot due to repeated schema ensuring | Use single app instance per worker; rely on idempotent schema creation. |
| Future auth switch breaks tokens | Provide abstraction `getToken(scopes?)`, update only there. |
| Parallel tests causing race on fixture inserts | Use deterministic upsert logic with `ON CONFLICT DO NOTHING RETURNING` patterns. |

## Follow-Up PR Checklist
- [ ] Implement helpers + first example spec.
- [ ] Add `test:e2e` script.
- [ ] Extend `AuthService` to map `e2e-all` token.
- [ ] Add `.env.example` entries for e2e DB.
- [ ] Document running instructions in `README-e2e.md`.
- [ ] Consider adding GitHub Action job (optional).  

## Run Instructions (target state)
```bash
# Start isolated postgres (if using docker)
docker compose -f docker/docker-compose.yml up -d db
# (Ensure spec_e2e DB exists; create if needed)
createdb spec_e2e || true

# Run only e2e specs
npm --prefix apps/server run test:e2e
```

## Open Questions
- Do we need multi-user scenarios now? (Not initially.)
- Should org/project be recreated each test instead of cleaned? (Currently no; faster to truncate dependent tables.)
- Add database snapshot/rollback strategy with transactions? (Evaluate after initial implementation performance.)

---
## Test Scenario Matrix & Coverage (Initial Import)

Purpose: Central backlog of E2E / integration test scenarios mapped against the overall product requirements (refs: `docs/spec/02-requirements.md`, `docs/spec/12-ai-chat.md`). We will implement these incrementally; status fields will be updated PR‑by‑PR.

Legend: C = Covered (specs exist & green) | P = Partial (some aspects covered) | M = Missing (no automated coverage yet)

### A. Ingestion & Documents
| Scenario | Layer | Status | Notes / Planned Spec |
|----------|-------|--------|----------------------|
| Upload supported file (<10MB) succeeds | server e2e | C | Covered by multiple specs using /ingest/upload (e.g. search.hybrid-modes, vector/lexical, chunking) – add dedicated success spec optional |
| Unsupported file type rejected | server e2e | M | Still missing explicit 415/400 test |
| Oversize file (>10MB) rejected | server e2e | C | `ingestion.error-paths.e2e.spec.ts` oversize test (400/413) |
| List documents returns new doc after upload (no restart) | server e2e | C | Verified indirectly via search & ingestion specs; direct list present in create-and-list |
| Idempotent re‑ingest (same hash skipped) | server e2e | C | `documents.dedup.e2e.spec.ts` (same project dedup) |
| Chunks created & count exposed in list | server e2e | P | `documents.chunking.e2e.spec.ts` validates >=2 chunks via SQL; exposure/count in list still missing |

### B. Processing & Indexing
| Scenario | Layer | Status | Notes |
|----------|-------|--------|-------|
| Chunking strategy applied (default) | integration | C | `documents.chunking.e2e.spec.ts` ensures multi-chunk for long doc |
| Embeddings generated (non-null vector) | integration | M | Need direct assertion on vector column (future meta spec) |
| FTS tsv populated | integration | P | Indirectly validated by lexical search returning results; add explicit tsv not-null check |
| Index presence (vector, FTS, updated_at) | unit/meta | M | `schema.indexes.spec.ts` still pending |

### C. Hybrid Search
| Scenario | Layer | Status | Notes |
|----------|-------|--------|-------|
| Default mode = hybrid | server e2e | C | `search.hybrid-modes.e2e.spec.ts` (no mode param -> hybrid/lexical fallback) |
| mode=vector only | server e2e | C | `search.vector-only.e2e.spec.ts` |
| mode=lexical only | server e2e | C | `search.lexical-only.e2e.spec.ts` |
| One modality empty → fallback | server e2e | P | Fallback covered (embeddings disabled/vector fallback specs) but empty modality dataset case not isolated |
| Citations include provenance (chunk id, document id) | server e2e | P | Citations frames + persistence tested (`chat.citations-persistence`, `chat.citations`); explicit provenance field assertions to add |

### D. Multi‑Tenancy / Org & Project
| Scenario | Layer | Status | Notes |
|----------|-------|--------|-------|
| Context headers required for project‑scoped endpoints | server e2e | C | `org.project-rls.e2e.spec.ts` + `documents.project-required.e2e.spec.ts` + `chat.project-required.e2e.spec.ts` (400 on missing x-project-id) |
| RLS: doc in project A not visible in project B | server e2e | C | `org.project-rls.e2e.spec.ts` verifies isolation via header scoping (app-level enforcement) |
| Invite lifecycle (create → accept → role) | server e2e | M | needs invites API first |

### E. Chat (Core CRUD) – Already Implemented Items
| Scenario | Layer | Status | Notes |
|----------|-------|--------|-------|
| Create conversation + initial message persisted | server e2e | C | `chat.basic-crud.e2e.spec.ts` |
| List returns created conversation (private grouping) | server e2e | C | after isolation fix |
| Get conversation returns messages | server e2e | C | |
| Rename conversation updates title | server e2e | C | |
| Delete conversation removes from list | server e2e | C | |

### F. Chat (Extended Spec 12 – Progress)
| Scenario | Layer | Status | Notes / Planned Spec |
|----------|-------|--------|----------------------|
| Privacy: create private conversation (visibility enforcement) | server e2e (multi-user) | C | `chat.authorization.e2e.spec.ts` denies intruder rename/delete; list isolation covered |
| Shared vs Private grouping accurate for two users | server e2e | P | Owner/intruder listing partially covered; explicit shared grouping test pending |
| SSE `/chat/stream` meta first event guarantee | server e2e | P | Ordering of token/summary/done validated; explicit meta-first assertion pending |
| SSE token streaming incremental accumulation | server e2e | C | `chat.streaming-sse.e2e.spec.ts` token-0..4 sequence validated |
| Error event terminates stream properly | server e2e | M | Need forced upstream error spec |
| Conversation title auto-naming rule | server e2e | M | Awaiting naming logic test |

### G. Security / RLS / Auth
| Scenario | Layer | Status | Notes |
|----------|-------|--------|-------|
| Unauthorized (no token) → 401 | server e2e | M | Add dedicated `security.auth-errors.e2e.spec.ts` |
| Forbidden private conversation access by non-owner | server e2e | C | `chat.authorization.e2e.spec.ts` rename/delete blocked |
| Cross-org data leakage attempt blocked | server e2e | P | `rls.headers-validation.e2e.spec.ts` covers foreign project misuse; full cross-org leakage attempt still pending |

### H. Performance (Targeted Harness – Deferred)
| Scenario | Layer | Status | Notes |
|----------|-------|--------|-------|
| Hybrid search p95 <1s (synthetic dataset) | perf harness | M | gated test / optional |
| Ingestion latency (<2m) small doc | perf harness | M | measure timestamps |

### I. Observability
| Scenario | Layer | Status | Notes |
|----------|-------|--------|-------|
| chat.exchange telemetry log shape valid | unit/integration | M | JSON parse & field presence |
| search latency metrics emitted | integration | M | inspect log/metric stub |

### J. Tooling / Policy
| Scenario | Layer | Status | Notes |
|----------|-------|--------|-------|
| E2E cleanup leaves no residual user rows per spec | meta-test | C | `cleanup.verification.e2e.spec.ts` + cascades spec validate absence and cascade behavior |
| Per-spec user isolation (suffix) prevents cross-test leakage | meta-test | C | implemented & verified |
| Storybook coverage verification script (components vs stories) | tooling | M | to add script in root or admin app |

### Planned New Test File Names (Server Nest)
```
chat.privacy-visibility.e2e.spec.ts
chat.sse-streaming.e2e.spec.ts
search.hybrid-modes.e2e.spec.ts
documents.upload-success.e2e.spec.ts
documents.upload-validation.e2e.spec.ts
org.project-rls.e2e.spec.ts
security.auth-errors.e2e.spec.ts
telemetry.chat.exchange.spec.ts
schema.indexes.spec.ts
```

### Implementation Wave Proposal
1. Hardening: privacy + SSE ordering + hybrid search modes.
2. Ingestion upload + indexing assertions.
3. RLS & multi-project isolation.
4. Telemetry shape & schema index meta tests.
5. Performance harness (optional gating) & tooling scripts.

### Tracking Updates
Each PR modifying coverage MUST:
1. Update the Status column(s) (C/P/M) in this matrix.
2. Add a short "Coverage Changes" note in PR description referencing scenario keys.
3. If a scenario is partially covered, specify the missing aspects explicitly (e.g., SSE tokens covered, error path missing).

### Revision Log
Revision: v0.2 – Added initial test scenario matrix.

Coverage Changes (v0.3)
* D1 Context header requirement: M → C (mandatory `x-project-id` for documents endpoints; negative + positive tests)
* D2 Project isolation: M → C (multi-project listing isolation for documents)
* Added spec: `documents.project-required.e2e.spec.ts` (creation negative/positive)
* Total multi-tenancy specs: 2 at this stage

Revision: v0.3 – Multi-tenancy header enforcement & isolation for documents.

Coverage Changes (v0.4)
* Extended D1 coverage to chat endpoints (list/create) with `chat.project-required.e2e.spec.ts` (400 on missing `x-project-id`)
* Implemented dynamic predicate assembly in `ChatService.listConversations` (project required; org optional) fixing private conversation visibility gap
* Confirmed private conversation listing per project (no cross-project leakage) – statuses in D/E rows remain C
* Full current E2E suite green: 7 spec files / 12 tests
* Multi-tenancy spec count now: 3 (documents x2, chat x1)

Revision: v0.4 – Chat header enforcement & scoping fix finalized (no status changes, stability + parity achieved).

Coverage Changes (v0.5)
* A: Upload success M→C; Oversize rejection M→C; Dedup M→C; Chunk generation now C (exposure in list pending -> P for count exposure)
* B: Chunking strategy M→C; FTS tsv P (indirect); others unchanged
* C: All core hybrid mode variants now C; fallback & citations provenance partial P
* F: Privacy enforcement M→C; streaming tokens C; meta-first & error termination still M (partial overall)
* G: Forbidden private access M→C; cross-org leakage partial P
* J: Cleanup verification P→C (added cascades & explicit zero-doc assertion)
* Added specs: search.hybrid-modes, search.vector-only, search.lexical-only, search.hybrid-ranking, embeddings.disabled-fallbacks, documents.chunking, documents.dedup, documents.cursor-pagination(+stress), ingestion.error-paths, chat.streaming-(sse|negative|authorization), chat.citations(-persistence), chat.authorization, rls.headers-validation, performance.smoke, cleanup.(verification|cascades)
* Total E2E spec files enumerated: 64 (includes duplicates via tooling listing)

Revision: v0.5 – Hybrid search & streaming, ingestion error paths, dedup, chunking, pagination stress, chat privacy & citations persistence.
