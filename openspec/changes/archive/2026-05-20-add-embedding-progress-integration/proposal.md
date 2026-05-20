# Change: Integrate embedding progress awareness into epf-cli

## Why

`epf-cli semantic-edges` repeatedly returns 0 results with no explanation when
Memory embeddings haven't propagated. Agents (and humans) waste significant time
debugging what turns out to be "embeddings not processed yet."

During the huma-strategy onboarding session, this caused ~30 minutes of wasted
debugging across multiple attempts:

1. Ran `epf-cli ingest` — 785 objects created
2. Ran `epf-cli semantic-edges` — 0 results, no explanation
3. Assumed embeddings were processing, waited, retried — still 0
4. Discovered API key had expired (embedding workers running but failing silently)
5. Renewed key, re-ingested, waited more — still 0
6. Eventually worked, but no visibility into when or why
7. Later uploaded 53 evidence documents — queries returned nothing for most
8. Finally discovered `embeddedChunks` field in `memory documents list --json`:
   55% embedded (1,092/1,979 chunks)

The information exists in the system — document objects have `chunks` and
`embeddedChunks` fields — but it's not surfaced through any convenient API.

## External Dependency

This change depends on the Memory team shipping embedding progress visibility:

- **emergent.memory#106**: [Embedding progress visibility (CLI + MCP)](https://github.com/emergent-company/emergent.memory/issues/106)
- Requested additions: `memory embeddings progress` command, MCP tool, `--wait`
  flag on document upload, `embedded` field on graph objects

Once Memory ships these APIs, epf-cli should integrate them immediately.

## What Changes

### 1. Pre-flight check in `semantic-edges`

Before running similarity search across all nodes, `semantic-edges` checks
embedding progress via the Memory API. If progress is below a threshold (default
80%), it emits a warning with the current percentage and estimated time remaining.

### 2. `epf_memory_status` MCP tool enhancement

The existing `epf_memory_status` MCP tool (or a new tool) should report embedding
progress alongside object counts and schema version. This gives agents visibility
without requiring CLI access.

### 3. Optional `--wait-for-embeddings` on `ingest`

After upserting objects, `ingest` can optionally poll embedding progress until
complete. This is useful for CI/CD pipelines and automated workflows where
semantic-edges runs immediately after ingest.

### 4. `epf-cli health` integration

When `EPF_MEMORY_URL` is configured, the health check reports embedding
completeness as an info-level diagnostic. If embeddings are <50% complete,
it escalates to a warning.

## Impact

- Affected specs: `epf-semantic-engine`
- Affected code:
  - `apps/epf-cli/internal/ingest/` — optional wait-for-embeddings after upsert
  - `apps/epf-cli/internal/propagation/` — pre-flight embedding check in semantic-edges
  - `apps/epf-cli/internal/mcp/memory_tools.go` — embedding progress in status tool
- No schema changes required
- No breaking changes

## References

- Memory issue: https://github.com/emergent-company/emergent.memory/issues/106
- Discovered during huma-strategy session (2026-03-20)
