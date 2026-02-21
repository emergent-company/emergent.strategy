## Context

Two independent users ran multi-hour EPF instance remediation sessions (28-60+ tasks each) and converged on the same core issues. The EPF CLI MCP server is strong on diagnostics but unreliable during iterative edit-validate cycles due to stale caching and filename-dependent artifact discovery. The lack of structured write tools forces agents into raw YAML editing, which is error-prone and slow.

This change addresses the most impactful feedback across both reports, focusing on reliability fixes first, then high-value new tools.

Stakeholders: AI agent users of the EPF MCP server (via Cursor, OpenCode, etc.)

## Goals / Non-Goals

### Goals
- Eliminate stale data bugs that cause phantom validation errors
- Make all strategy context tools work with numbered-prefix file naming
- Provide structured write tools for the 3 most common editing patterns: KR updates, value model population, and cross-file path renames
- Improve analysis tool output to be actionable without follow-up calls

### Non-Goals
- Full wizard-based remediation flows (deferred to a separate proposal)
- Persona similarity/dedup analysis (low priority, no consensus on approach)
- Backup management / undo system (rely on git instead)
- `epf_recommend_workflow` meta-tool (premature — tool surface is still evolving)
- Deduplicating MCP server prefixes (configuration concern, not code change)

## Decisions

### Decision: mtime-based cache invalidation (not file watching)

Use filesystem mtime checks on each tool call rather than file-watching (inotify/fsevents).

**Rationale:** MCP servers are short-lived processes started by editors. File watching adds complexity (goroutine management, OS-specific APIs, race conditions on rapid edits) for minimal benefit. Checking mtime on each tool call is simple, reliable, and sufficient since MCP tool calls are the only read path.

**Alternatives considered:**
- File watching (inotify/fsevents) — too complex for the benefit, OS-specific
- TTL-based expiry — arbitrary timeouts don't match actual edit patterns
- No caching at all — would slow down multi-tool workflows that read the same files repeatedly

### Decision: Content-based artifact discovery with filename fallback

Primary: scan `meta.artifact_type` YAML field. Fallback: glob patterns like `*strategy_formula*.yaml`.

**Rationale:** The `meta.artifact_type` field is already present in most EPF artifacts and is already used by `epf_validate_file` for type detection. Sharing this logic across all tools ensures consistency. Filename fallback handles older instances that may not have the meta field.

**Alternatives considered:**
- Filename-only with glob patterns — handles numbering but not renamed files
- Directory-based conventions — too rigid, doesn't handle flat structures

### Decision: Track-aware field structure in write tools

Write tools auto-detect whether to use `sub_components` (product) or `subs` (non-product) field structure based on the `track` parameter.

**Rationale:** This was explicitly called out in both feedback reports as a trial-and-error discovery. Encoding the track-specific schema differences in the write tools eliminates this friction entirely.

### Decision: Dry-run support on all new write tools from day one

All new write tools (`epf_update_kr`, `epf_add_value_model_component`, `epf_add_value_model_sub`, `epf_rename_value_path`) include `dry_run` parameter.

**Rationale:** Both reports requested this. It's trivial to implement at creation time but harder to retrofit. Builds agent trust by allowing preview before commit.

## Risks / Trade-offs

- **mtime granularity**: Some filesystems have 1-second mtime resolution. Rapid edits within the same second could miss invalidation. Mitigation: after MCP write operations, always invalidate regardless of mtime (belt and suspenders).
- **Content scanning performance**: Reading `meta.artifact_type` from all YAML files on each tool call could be slow for large instances. Mitigation: cache the artifact type index with mtime-based invalidation (same mechanism). Most instances have <50 YAML files.
- **Scope creep**: Both reports contain 30+ suggestions each. This change intentionally limits scope to the highest-impact items. Lower-priority items are documented in the proposal but not tasked.

## Open Questions

- Should `epf_rename_value_path` also update the value model file itself (e.g., rename the component ID), or only update references? Initial implementation: references only, since value model structure changes are rarer and more dangerous.
- Should `epf_batch_validate` support non-feature artifact types? Initial implementation: features only, extensible later via `artifact_type` parameter.
