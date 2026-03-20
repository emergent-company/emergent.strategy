# Tasks: Embedding Progress Integration

## Blocked — waiting on emergent.memory#106

- [ ] **Monitor emergent.memory#106** for completion of embedding progress API
  - Track: `memory embeddings progress` CLI command
  - Track: MCP `embedding-progress` tool
  - Track: `embedded` field on graph object responses

## Ready to implement once #106 ships

- [ ] **Add Memory client method for embedding progress**
  - Package: `apps/epf-cli/internal/memory/`
  - Call the new embedding progress endpoint
  - Parse response into typed struct: `{Documents: {TotalChunks, EmbeddedChunks}, Objects: {Total, Embedded}}`

- [ ] **Pre-flight check in `semantic-edges`**
  - Package: `apps/epf-cli/internal/propagation/`
  - Before similarity search loop, call embedding progress
  - If <80% objects embedded: warn and continue
  - If <20% objects embedded: warn strongly, suggest waiting
  - Log: `"⚠ Embedding progress: 48% (400/831 objects). Semantic edges may be incomplete."`

- [ ] **Add `--wait-for-embeddings` flag to `ingest` and `sync`**
  - Package: `apps/epf-cli/internal/ingest/`
  - After upsert completes, poll embedding progress every 5s
  - Exit when 100% embedded or timeout (default 5 min, configurable with `--embed-timeout`)
  - Show progress: `"Embedding: 400/831 objects (48%)..."`

- [ ] **Embed progress in `epf_memory_status` MCP tool**
  - Package: `apps/epf-cli/internal/mcp/memory_tools.go`
  - Add embedding progress section to status output:
    ```
    Embedding Progress:
      Documents: 1092/1979 chunks (55%)
      Objects: 400/831 (48%)
      Estimated remaining: ~3 minutes
    ```

- [ ] **Health check integration**
  - Package: `apps/epf-cli/internal/` (health check code)
  - When `EPF_MEMORY_URL` is configured, check embedding progress
  - <50% embedded → warning
  - ≥80% embedded → info (healthy)
  - No Memory configured → skip

## Testing

- [ ] **Unit test**: embedding progress client with mock API responses
- [ ] **Integration test**: pre-flight check warns when embeddings incomplete
- [ ] **Integration test**: `--wait-for-embeddings` polls until complete
- [ ] **Manual test**: run against huma-strategy project after fresh ingest
