# Testing & Coverage Strategy

_Last updated: 2025-09-27_

## Goals
Provide meaningful, stable coverage metrics focused on real business / logic code while avoiding noise from structural NestJS scaffolding and generated or declarative files. Enable a phased improvement path instead of a single disruptive gate.

## Test Layers
| Layer | Location | Purpose | Example |
|-------|----------|---------|---------|
| Unit / Service | `apps/server-nest/tests/**` & collocated `__tests__` directories | Exercise pure / mostly pure service logic, utilities, small branching flows | `hash.service.spec.ts`, `user-profile.service.spec.ts` |
| Scenario / E2E-lite | `tests/scenarios/*.spec.ts` | High-level flows over real DB (minimal schema) and HTTP layer | `user-first-run.spec.ts` |
| Integration (Selective) | `tests/*.spec.ts` (service+DB) | Validate SQL shape, migration side-effects, permission behavior | `documents.service.spec.ts` |
| True E2E (future) | Separate Playwright / API test harness | Cross-application UX/regression | (planned) |

## Coverage Configuration
Coverage is produced via **Vitest (v8 provider)**. Two conceptual tracks:

1. **Unit/Service Coverage (Gated)** – Enforced thresholds; excludes structural & declarative files.
2. **E2E / Scenario Coverage (Informational)** – May be run separately; not part of gating threshold yet.

### Key Files
- `apps/server-nest/vitest.config.ts` – Unit/service coverage config & threshold gate
- `apps/server-nest/vitest.e2e.config.ts` – E2E/scenario runner (optional coverage)

### Exclusions Rationale
Excluded patterns (abbrev.) in `coverage.exclude`:
- `**/*.module.ts`, `**/*.controller.ts` – Nest wiring (little executable logic)
- `**/dto/**`, `**/decorators/**`, `**/interceptors/**`, `**/pipes/**`, `**/filters/**` – Data shape & framework cross-cutting concerns
- Bootstrap & infra: `main.ts`, `openapi*`, config / index re-exports
- Test & generated artifacts: `tests/**`, `dist/**`, `coverage/**`
- Reference / unrelated front-end code: `reference/**`

This focuses reported % on logic we actually intend to exercise and improve.

## Current Thresholds (Phase 1)
```
statements: 55%
lines:      55%
functions:  65%
branches:   60%
```
These were calibrated after initial exclusion refinement to reflect the genuine pre-improvement baseline (~54.7% lines). They are intentionally modest to allow incremental PR-level lifts.

### Planned Ramp
| Phase | Trigger | New Lines/Statements | New Funcs | New Branches |
|-------|---------|----------------------|-----------|--------------|
| 1 (current) | Baseline established | 55% | 65% | 60% |
| 2 | Auth + Ingestion + Chat baseline tests merged | 60% | 68% | 62% |
| 3 | Database + Orgs/Projects service coverage uplift | 65% | 70% | 65% |
| 4 | Target mid-term | 70% | 72% | 68% |
| 5 | Stretch (post refactors) | 75% | 75% | 70% |

Increases require the prior phase to hold green across at least two successive main-branch runs.

## Adding / Modifying Tests – Guidelines
1. **Prefer Narrow, Deterministic Tests**: Target specific branches or error paths rather than broad duplication of scenario coverage.
2. **Mock at the Service Boundary**: For pure logic or simple SQL shape, mock `DatabaseService.query()` with controlled return values. Reserve real DB interaction for flows verifying schema DDL, triggers, or indexes.
3. **Avoid Over-testing Auto-generated SQL**: Only assert SQL fragments (e.g., column mapping) that are part of intentional logic (like snake_case conversion in `UserProfileService.update`).
4. **Name Tests Clearly**: Use behavior-first phrasing: `update throws not_found when profile missing`.
5. **One Assertion Cluster per Path**: It’s fine to have multiple `expect` calls if they validate one logical outcome; group them.

### Patterns
- Utility / pure function: minimal arrange, direct assert.
- Branch-heavy service: table of inputs → expected result/exception (loop with `it.concurrent.each` optional).
- Error branch: assert thrown error value / message precisely (avoid broad `toThrow()` unless message unimportant).

## Writing New Service Tests (Checklist)
- [ ] Identify uncovered lines/branches (see coverage table)
- [ ] Select the narrowest unit(s) producing those branches
- [ ] Decide: mock DB / external API vs real DB (default: mock)
- [ ] Implement test(s) ensuring each distinct conditional path executes at least once
- [ ] Re-run `npm --workspace=server-nest run test:coverage`
- [ ] Confirm thresholds still pass & note new percentages in PR description

## Scripts
At repository root (examples):
```
npm run test:coverage:server        # Unit/service gated coverage
npm run test:coverage:server:e2e    # Scenario (E2E-lite) coverage
npm run test:coverage:server:all    # Sequential unit + scenario
```
(An Admin app coverage flow exists similarly, but currently outside this server-focused doc.)

## Interpreting Coverage Report
Focus first on 0% or <40% logic-bearing files (`auth.service.ts`, `chat.service.ts`, `ingestion.service.ts`, `database.service.ts`, `projects.service.ts`, `health.service.ts`). Prioritize breadth (touch each service at least minimally) before deep branch perfection.

### Example Quick-Win Targets
| File | Rationale | Suggested Tests |
|------|-----------|-----------------|
| `auth.service.ts` | Core request claims parsing & scope resolution untested | Happy path claims extraction, missing header -> error, invalid token branch |
| `ingestion.service.ts` | Many conditional early-exit + chunking logic | Duplicate detection, unsupported mime path, successful ingest with chunk call mock |
| `chat.service.ts` | Conversation/message persistence & access control | Create conversation private vs public, append messages (user + assistant) |
| `database.service.ts` | Lazy init & skip-db branches | `skipDb` returns empty rows, lazy init offline path, metrics snapshot |

## When to Adjust Exclusions
Only add to `coverage.exclude` if a file:
- Contains zero or negligible logic (pure Nest DI wiring), AND
- Would artificially depress coverage without yielding user value if tested.
Refactors that introduce logic into previously excluded categories should re-evaluate inclusion.

## PR Template Snippet (Suggest Adding)
```
### Coverage
Before: (lines %) -> After: (lines %)
New / Notable Files Tested: ...
Remaining Key Gaps: auth.service.ts (0%), chat.service.ts (0%)
Phase Threshold: 55% lines/statements (met)
```

## Future Enhancements
- Enforce minimum delta coverage on changed lines (e.g., via `vitest --changed` + diff-based tooling)
- Add badge generation from lcov summary
- Track historical metrics (simple commit hook writing JSON to `coverage-history/` for sparklines)

## Questions / Exceptions
Open a small discussion or add a comment in the PR if:
- A service is intentionally left untested due to imminent refactor.
- Adding a test would require large, brittle mocks (consider extracting logic instead).

---
Maintaining forward momentum (steady % increase) is preferred over abrupt jumps. Small, scoped test additions per feature/change keep the gate green while continuously improving confidence.
