# NestJS Migration Checklist

Status: Draft
Owner: Backend
Last Updated: 2025-09-09

## Objective
Migrate the current lightweight Express server to a structured NestJS application while preserving all public API contracts (paths, methods, schemas, error envelope, SSE sequencing). Eliminate manual OpenAPI drift by generating the spec from decorators and post‑processing it with tag groups.

## Scope
In Scope:
- All existing REST + SSE endpoints (`/health`, auth password probe/login, orgs, projects, settings, ingestion, search, documents, chunks, chat).
- Error envelope standardization via Nest global exception filter.
- OpenAPI 3.1 generation + `x-tagGroups` injection.
- SSE streaming for `/chat/stream` using `@Sse`.
- Multi‑tenancy/org/project context propagation.
- Contract diff testing.

Out of Scope (initial migration):
- New features or schema changes to domain entities.
- Background queue orchestration refactors.
- Storage backend changes.
- Rate limiting & metrics (instrumentation hooks can be stubbed).

## Deliverables
- `apps/server/` (or in-place refactor) with modular Nest structure.
- Generated spec at runtime served under `/openapi/openapi.json` (+ temporary YAML compatibility if desired).
- Post‑processed OpenAPI containing `x-tagGroups` matching prior manual spec.
- Automated spec diff test preventing breaking changes.
- Removal of legacy Express code & manual `openapi.yaml` after acceptance.

## High-Level Phases
1. Preparation & Planning
2. Scaffold & Core Modules
3. Feature Modules Parity (non-chat)
4. Chat SSE Module
5. Ingestion Module
6. OpenAPI Generation & Tag Groups
7. Contract Diff & CI Integration
8. Cutover & Decommission Express
9. Post‑Migration Hardening

---
## Phase 1: Preparation & Planning
Checklist:
- [ ] Create migration branch `feat/nest-migration`.
- [ ] Decide structure: new folder `apps/server` vs in-place (default: new folder for parallel run).
- [ ] Lock current manual `openapi.yaml` snapshot (tag commit) for diff baseline.
- [ ] Inventory env vars & config assumptions; draft env schema.
- [ ] Capture performance baseline (p50/p95 latency for key endpoints, SSE start latency, memory).

Acceptance to proceed:
- [ ] Baseline metrics recorded.
- [ ] Architectural decisions documented (in `docs/spec/03-architecture.md`).

## Phase 2: Scaffold & Core Modules
Checklist:
- [ ] Initialize Nest app (strict mode, ESM if consistent with repo strategy).
- [ ] Add dependencies: `@nestjs/swagger`, `class-validator`, `class-transformer`, `pg`, (optionally) `cls-hooked` / `async-local-storage`.
- [ ] Implement `ConfigModule` with env schema.
- [ ] Implement `DatabaseModule` (pg Pool) with graceful shutdown.
- [ ] Implement `AuthModule` (JWT validation + guard, extracting user ID & claims).
- [ ] Implement `HealthModule` controller returning existing JSON structure.
- [ ] Global validation pipe (whitelist, transform, error mapping -> 422).
- [ ] Global exception filter mapping to `{ error: { code, message, details } }`.
- [ ] Logging interceptor (request id, timing) — optional initial stub.

Acceptance:
- [ ] `/health` parity confirmed (status + fields).
- [ ] Error envelope shape matches old responses.

## Phase 3: Feature Modules Parity (Non-Chat)
Modules: Orgs, Projects, Settings, Search, Documents, Chunks.
Checklist:
- [ ] Create DTOs mirroring current schemas (avoid renaming fields).
- [ ] Controllers expose identical routes & verbs.
- [ ] Services call existing repository/query helpers (ported or wrapped).
- [ ] RLS context interceptor sets `SET LOCAL` for user/org/project each request.
- [ ] Pagination & query parameter validation (e.g., pageSize bounds) enforced via DTO.

Acceptance:
- [ ] Automated contract test: all endpoints respond 2xx with expected skeleton fields.
- [ ] Spec generation includes these paths + tags.

## Phase 4: Chat SSE Module
Checklist:
- [ ] Define DTOs: `ChatRequestDto` (validation: message non-empty, topK range), response models (`CitationDto`, `MessageDto`, `ConversationDto`, `ChatChunk` as union type or interface references).
- [ ] `ChatController` with `@Sse('chat/stream')` returning `Observable<MessageEvent>`.
- [ ] Implement service bridging existing retrieval + LLM streaming logic.
- [ ] Sequence: emit meta → tokens → done/error (test). No tokens after terminal.
- [ ] Abort handling on client disconnect.

Acceptance:
- [ ] SSE integration test matches event ordering & field names.
- [ ] Throughput & latency comparable to baseline (<= +10% overhead p95 start time).

## Phase 5: Ingestion Module
Checklist:
- [ ] File upload endpoint via `FileInterceptor('file')` with size limits.
- [ ] URL ingestion controller method.
- [ ] Reuse existing ingestion pipeline functions.
- [ ] Validate URL (well-formed, allowed protocol).

Acceptance:
- [ ] Upload & URL endpoints produce same responses as legacy.

## Phase 6: OpenAPI Generation & Tag Groups
Checklist:
- [ ] Enable SwaggerModule in bootstrap, generate document.
- [ ] Tag each controller/method with `@ApiTags()` preserving prior grouping semantics.
- [ ] Post-process JSON spec to insert `x-tagGroups`.
- [ ] Serve JSON at `/openapi/openapi.json`.
- [ ] (Optional) Provide YAML via conversion (`js-yaml`).

Acceptance:
- [ ] Diff vs baseline: only structural reordering allowed; schemas/paths stable.

## Phase 7: Contract Diff & CI Integration
Checklist:
- [ ] Add script `scripts/diff-openapi.ts` comparing old YAML and generated JSON (normalize ordering; ignore `version`, `servers`).
- [ ] Add CI step: run generator → diff → fail on breaking changes (removed path, removed required field, changed type).
- [ ] Add Spectral lint (optional) for style & rule conformance.

Acceptance:
- [ ] CI fails on intentional breaking change test.

## Phase 8: Cutover & Decommission Express
Checklist:
- [ ] Run Nest & Express in parallel on different ports; smoke test Admin UI against Nest (via temporary proxy).
- [ ] Update dev/start scripts to point to Nest.
- [ ] Remove legacy Express server code & manual `openapi.yaml` (after final approval).
- [ ] Update documentation (`README.md`, specs) to reference generated spec only.

Acceptance:
- [ ] All integration tests green using Nest.
- [ ] Manual exploratory verification (SSE, search, ingestion) passes.

## Phase 9: Post-Migration Hardening
Checklist:
- [ ] Add metrics interceptor (histograms for latency, SSE duration, token count).
- [ ] Add request rate limiting (future enhancement placeholder).
- [ ] Document developer onboarding updates.
- [ ] Create follow-up tickets for non-goal enhancements (background queue, rate limits, advanced telemetry).

Acceptance:
- [ ] Observability baseline established.

---
## Graph Module Versioning & Soft Delete (Added 2025-09-25)

The graph objects & relationships now use an append-only versioning model with soft deletes implemented via tombstone head rows. Queries MUST follow the documented **head-first then filter** pattern to avoid resurfacing stale pre-delete versions. See detailed design & operational guidelines in `apps/server/docs/graph-versioning.md`:

Key points:
- Each logical entity identified by `canonical_id`; latest state = max `version` (head).
- Soft delete appends a tombstone (head with `deleted_at` set). Deleted entities are excluded by selecting heads first, filtering out tombstones afterward.
- Restore appends a new live version with `supersedes_id` referencing the tombstone.
- Distinct selection pattern (simplified):
   ```sql
   SELECT * FROM (
      SELECT DISTINCT ON (canonical_id) *
      FROM kb.graph_objects
      ORDER BY canonical_id, version DESC
   ) h
   WHERE h.deleted_at IS NULL;
   ```
- Composite indexes: `(canonical_id, version DESC)` on both objects & relationships.
- E2E coverage: `tests/e2e/graph.soft-delete.e2e.spec.ts` ensures delete/restore correctness and stale version suppression.

Any new graph queries grouping by `canonical_id` must adopt this pattern. Violations risk data resurrection bugs.

---
## DTO & Validation Considerations
- Use explicit DTO classes with `@ApiProperty()` and validation decorators (e.g., `@IsUUID()`, `@IsInt()`, `@Min()`, `@Max()`); avoid implicit typing from entities.
- For arrays of UUIDs (e.g., `documentIds`), validate length & uniqueness (optional optimization).
- Ensure `topK` defaults applied in a transform pipe.

## Error Mapping Table
| Scenario | Legacy Code | Nest Implementation |
|----------|-------------|---------------------|
| Validation fail | 422 `validation-failed` | Throw `BadRequestException` mapped to 422 via custom filter OR custom ValidationException |
| Auth missing | 401 `unauthorized` | `AuthGuard` throws `UnauthorizedException` → filter sets code |
| Forbidden private conversation | 403 `forbidden` | Throw `ForbiddenException` |
| Not found | 404 `not-found` | `NotFoundException` |
| Unexpected error | 500 `internal` | Filter wraps generic error |

## Spec Diff Rules (Breaking Changes)
Break if:
- Path removed or method removed.
- Required property removed or type changed.
- Enum value removed (adding new is safe minor revision).
- Response status removed (for previously defined success path).
- Event field rename in ChatChunk.

## Rollback Plan
1. Keep Express server branch intact until one release after Nest cutover.
2. If critical production issue arises post-migration:
   - Repoint reverse proxy to Express container image (kept warm for 48h).
   - Redeploy spec file from tagged baseline.
   - File incident report; diff logs & performance metrics to isolate regression.
3. Roll forward with patched Nest fix; deprecate Express again.

## Verification Matrix
| Endpoint | Method | Checks |
|----------|--------|--------|
| /health | GET | 200 shape, no auth required |
| /api/auth/password | GET | 200, enabled fields |
| /api/auth/password/login | POST | 200 tokens, 401 invalid creds |
| /orgs | GET/POST | Auth required, list/create works |
| /orgs/{orgId}/projects | GET | Path param validation |
| /projects | POST | Creates project with orgId validation |
| /settings | GET | Returns list |
| /settings/{key} | GET/PUT | Upsert semantics preserved |
| /ingest/url | POST | Valid URL required |
| /ingest/upload | POST | File accepted, size limit enforced |
| /search | GET | q required, mode enum honored |
| /documents | GET | List returns consistent fields |
| /chunks | GET | Pagination & filters |
| /chunks/{id} | GET | 404 on missing id |
| /chat/stream | POST (SSE) | meta→token*→done ordering, abort, error frame |
| /chat/conversations | GET | Grouping correctness |
| /chat/{id} | GET/PATCH/DELETE | Access control, rename, delete |

## Performance Baseline Targets
| Metric | Target (<=) |
|--------|-------------|
| /health p95 | +5% over Express |
| /search p95 | +10% over Express |
| Chat first token latency p95 | +10% over Express |
| Memory overhead | < +20% RSS |

## Monitoring Post-Cutover
- Add temporary higher log verbosity for first 24h.
- Track error rate, latency, memory, SSE disconnect counts.
- Create dashboard panels for new Nest metrics.

## Completion Criteria
- [ ] All checklists through Phase 8 complete.
- [ ] Verification matrix green.
- [ ] Performance targets met.
- [ ] Rollback window passed with no critical incidents.
- [ ] Express code removed & documented.

---
Generated from migration plan in `docs/spec/03-architecture.md`; this file should be updated if scope/sequence changes.
