## OpenAPI Regression & Determinism Strategy

This server enforces stability of its generated OpenAPI spec through a layered set of lightweight regression guards. The goal is to surface *unintended* contract drift (missing paths, lost tags, removed security metadata) early, while keeping legitimate, intentional changes easy to ratify.

### 1. Generation Overview
OpenAPI is generated code‑first via `@nestjs/swagger` using `openapi-generate.ts` (invoked by `npm run gen:openapi`). Post‑generation mutation adds:

1. Security scope enrichment (`x-required-scopes`) by reflecting over controller methods with the custom `@Scopes(...)` decorator.
2. Tag group metadata (`x-tagGroups`) for UI organization.
3. Deterministic top‑level `tags` reconstruction if Swagger omits them (empty array regression observed once) – aggregated from operation tags and ordered by `x-tagGroups` then remaining alphabetical.

### 2. Deterministic Hash Policy
The regression hash intentionally considers *only*:

```json
{ "paths": <sorted path names>, "tags": <sorted top-level tag names> }
```

Reasoning:
- Path list & tag taxonomy are a concise signature of the public surface.
- Ignoring schemas keeps benign schema evolution (e.g. property description tweaks) from constantly invalidating the lock.
- Sorted arrays remove ordering noise.

File: `tests/openapi-regression.spec.ts`.

When adding or removing endpoints (or intentionally changing tag set) you must:
1. Run `npm run gen:openapi` inside `apps/server-nest`.
2. Recompute hash (the test prints it if `EXPECTED_HASH` temporarily set to `TO_SET`).
3. Update `EXPECTED_HASH` constant with a comment line describing the change.
4. Add a CHANGELOG entry under Unreleased describing the API surface change.

### 3. Supplemental Guard Tests
To reduce “mystery hash mismatch” debugging time, two complementary tests exist:

| Test | Purpose |
|------|---------|
| `tests/openapi-tags-presence.spec.ts` | Asserts top-level `tags` is non-empty and contains critical domain tag `Graph`. Prevents empty-tag regressions silently changing hash. |
| `tests/openapi-scopes-enrichment.spec.ts` | Ensures at least one operation has non-empty `x-required-scopes` array (verifies post‑generation enrichment step executed). |

### 4. Scope Enrichment Logic
Defined in `openapi-generate.ts`:
- Reflects over each controller method.
- Reads `@Scopes` metadata (string array) keyed by both `ControllerName_methodName` and plain `methodName` to withstand operationId strategy shifts.
- Injects `x-required-scopes` and ensures 401/403 response examples provide consistent structure with `missing_scopes` list.

### 5. Deterministic Tag Normalization
If `document.tags` is absent or an empty array, we rebuild it:
1. Collect distinct operation tag strings.
2. Flatten `x-tagGroups` order for primary ordering.
3. Append any remaining tags alphabetically.
4. Emit as `{ name: "Tag" }` objects.

This guards against upstream library behavior changes that previously dropped the aggregated tag list.

### 6. When to Update the Hash
Update only when:
- Adding/removing/renaming endpoints (path key changes).
- Intentionally reclassifying top-level tag taxonomy.

Do *not* update for:
- Schema shape refinements (unless accompanied by endpoint surface change).
- Description / summary text edits.
- Response example tweaks.

### 7. Debugging a Hash Mismatch
1. Run `npm run gen:openapi` again (ensure a fresh build).
2. Inspect differences in `openapi.json` path keys or top-level `tags`.
3. If only tags disappeared -> verify normalization still triggers (look at the `document.tags` array). If normalization failed, re-run with local console logs in generation script.
4. If a new path appears unintentionally, search codebase for new controller decorators (`@Get`, `@Post`, etc.).
5. If everything intentional, update `EXPECTED_HASH` and CHANGELOG.

### 8. Future Enhancements (Optional)
- Per-operation exact scope contract tests for critical endpoints.
- CI job that generates spec and checks the hash before running full test matrix (faster failure).
- Git hook / script verifying `openapi.json` regeneration prior to commit when touching controller files.

### 9. Developer Shortcuts
Generate spec & run all OpenAPI guard tests:

```bash
cd apps/server-nest
npm run gen:openapi && vitest run tests/openapi-*-spec.ts
```

Compute current regression hash (manual):

```bash
node -e "const fs=require('fs'),c=require('crypto');const s=JSON.parse(fs.readFileSync('openapi.json','utf-8'));const h=c.createHash('sha256').update(JSON.stringify({paths:Object.keys(s.paths||{}).sort(),tags:(s.tags||[]).map(t=>t.name).sort()})).digest('hex');console.log(h)" 
```

---
Maintainers: keep this document updated whenever the regression strategy evolves.
