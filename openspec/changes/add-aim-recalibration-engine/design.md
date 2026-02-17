## Context

The EPF AIM phase currently has read-only tooling and no closed-loop feedback. The existing CLI commands (`aim assess`, `aim okr-progress`, `aim validate-assumptions`) generate templates and reports but cannot write results back, and nothing propagates calibration decisions into READY artifacts. This design describes the architectural decisions for building a complete AIM recalibration engine across four phases.

### Stakeholders

- **EPF CLI users** — need write-back tools for AIM artifacts
- **AI Strategy Agent** (future) — needs MCP tools to autonomously run AIM sessions
- **EPF Cloud Server** (future) — needs monitoring integration for server-side trigger evaluation

## Goals / Non-Goals

### Goals

- Enable complete AIM cycle execution via CLI and MCP tools (write assessment, calibrate, propagate)
- Support cycle-over-cycle tracking with archived history
- Automate drift detection and trigger evaluation
- Prepare data contracts for autonomous AI recalibration
- Maintain backward compatibility with existing AIM commands

### Non-Goals

- Building a full data warehouse or analytics platform (metrics are lightweight YAML files)
- Real-time monitoring (weekly cadence is sufficient for Phase 3)
- Multi-tenant monitoring (single instance per server, multi-instance is a cloud server concern)
- UI/dashboard for AIM data (CLI and MCP are the interfaces)

## Decisions

### 1. AIM artifact write-back via structured input, not freeform YAML

**Decision:** Write-back commands accept structured parameters (field-level updates) rather than accepting raw YAML content to overwrite files.

**Rationale:** Structured input enables:
- Validation at write time (reject invalid states)
- Automatic evolution log entries (track what changed and why)
- Merge semantics (update specific fields without losing others)
- MCP tool compatibility (JSON parameters map cleanly)

**Alternative considered:** Accept raw YAML and validate after write. Rejected because it doesn't enable automatic evolution tracking and makes MCP tool design harder (large string parameters).

### 2. Cycle archival as directory snapshots

**Decision:** Completed cycles are archived as `cycles/cycle-N/` directories containing copies of the assessment report, calibration memo, track health signals, and a snapshot of the LRA at cycle end.

**Rationale:** Simple, git-friendly, enables cycle-over-cycle comparison. The LRA snapshot captures the baseline that was in effect during the cycle, while the current LRA evolves.

**Alternative considered:** Single timeline file with all cycles appended. Rejected because it becomes unwieldy and makes cycle-specific queries harder.

### 3. Recalibration as changeset, not direct write

**Decision:** `aim recalibrate` generates a changeset (structured diff) that can be previewed (`--dry-run`) before applying. Applied changes are logged in the LRA evolution log.

**Rationale:** Recalibration touches foundational READY artifacts (north star, strategy formula). These changes should be reviewable before applying. The changeset format also enables the AI agent to generate proposals as PRs.

### 4. Metrics as timestamped YAML in AIM/metrics/

**Decision:** Ingested metrics are stored as simple timestamped YAML files in `AIM/metrics/YYYY-MM-DD_<source>.yaml`. No database.

**Rationale:** Keeps the entire EPF instance as a git-trackable YAML tree. Metric files are small and infrequent (weekly). Schema validation applies. This is sufficient for the monitoring use case; production analytics should live in dedicated systems.

**Alternative considered:** SQLite database in AIM directory. Rejected because it breaks the "everything is YAML in git" principle and adds a binary file to the repo.

### 5. Monitoring as periodic check, not persistent daemon

**Decision:** `aim monitor` is a periodic evaluation command (invoke via cron, CI, or as a scheduled goroutine in the MCP server) rather than a standalone daemon process.

**Rationale:** A daemon adds operational complexity (process management, crash recovery, resource usage). Periodic evaluation is sufficient for weekly cadence. The MCP server already has a long-running process that can host scheduled checks if needed. Cloud Run's scheduled invocations provide the server-side equivalent.

### 6. Canonical EPF repo must be kept in sync

**Decision:** Any changes to AIM schemas, templates, or wizards must be made in `emergent-company/epf-canonical` (locally at `/Users/nikolaifasting/code/canonical-epf`) first, then synced into `epf-cli` via `sync-embedded.sh`.

**Architecture:**

```
epf-canonical (source of truth)
  schemas/*.json, templates/AIM/*.yaml, wizards/*.md
       |
       | sync-embedded.sh (copies at build time)
       v
epf-cli/internal/embedded/
  schemas/, templates/, wizards/
       |
       | Go //go:embed
       v
Compiled epf-cli binary (3-tier fallback at runtime)
```

**What this means per phase:**

| Phase | Canonical changes likely needed |
|-------|-------------------------------|
| 1 | None expected (writing to existing artifact types), but schema gaps discovered during implementation go upstream |
| 1B | Yes: fix 3 schemas (LRA trigger enum, assessment assumption pattern, assessment/calibration meta), rewrite 3 templates (assessment, calibration, LRA), update 1 wizard (synthesizer) |
| 1C | Yes: new SRC schema + template + wizard in `epf-canonical`. Register artifact type in epf-cli schema/template registries |
| 2 | Possible: changeset format schema, wizard updates to `synthesizer.agent_prompt.md` with recalibration guidance |
| 3 | Yes: metric schema (new artifact type), trigger config schema extensions, probe report schema |
| 4 | Yes: new AI agent instruction sets for AIM operations |

**Workflow for each phase:**

1. Make schema/template/wizard changes in `canonical-epf` first
2. Run `sync-embedded.sh` to copy into `epf-cli/internal/embedded/`
3. Build and test `epf-cli` against updated embedded content
4. Commit to both repos (canonical first, then emergent-strategy)

**Alternative considered:** Making changes in `internal/embedded/` directly and back-porting to canonical later. Rejected because it creates divergence risk and the sync is one-directional (canonical → embedded).

### 7. Canonical alignment: schemas are authoritative, templates and tools adapt

**Decision:** When schemas, templates, and tools disagree, the schema is the source of truth. Templates and tool code adapt to match schemas — not the other way around — with a small number of exceptions where the schema has a clear bug (e.g., assumption ID pattern that no existing artifact uses).

**Rationale:** The Phase 1 post-implementation audit revealed 9 gaps where schemas, templates, and bootstrap tools contradicted each other (e.g., assessment report template nesting OKRs by track while the schema defines a flat array; LRA template using field names and enum values that don't exist in the schema; bootstrap tool offering enum values that fail validation). The root cause is that schemas, templates, and tools were authored at different times without cross-validation.

The fix principle:
- **Schemas** define the contract. They change only when the contract itself is wrong (e.g., `asmp-` pattern that contradicts the documented `asm-` convention used everywhere else).
- **Templates** are examples. They must produce YAML that could pass schema validation (ignoring placeholder content like "TBD").
- **Tools** are producers. Their output must pass schema validation.
- **Wizards** are guides. They reference current tool names and artifact structures.

**What this means for Phase 1B:** All 5 AIM templates are being rewritten for schema compliance. The LRA schema gets one enum addition (`cycle_transition`). The assessment report schema gets one pattern correction (`asm-` prefix). Both assessment and calibration schemas get an optional `meta` field. The bootstrap tool's enum values are remapped to match the schema.

**Alternative considered:** Expanding schemas to accept both template and tool values (e.g., accepting both `asmp-` and `asm-` patterns). Rejected because it creates ambiguity about what the "right" format is, and downstream consumers (the recalibration engine in Phase 2) need a single canonical format.

### 8. Strategic Reality Check as a new artifact type, organized by detection type

**Decision:** Introduce a new AIM artifact type — `strategic_reality_check` — to evaluate all READY and FIRE artifacts against current reality. The SRC is organized by **detection type** (5 sections: belief validity, market currency, strategic alignment, execution reality, recalibration plan), not by artifact.

**Rationale:** A deep audit of all 14 EPF schemas revealed that AIM only evaluates the Roadmap Recipe. The Assessment Report tracks OKR outcomes and assumption validations; the Calibration Memo recommends next steps. But neither artifact has structured data to evaluate whether the other 6 READY artifacts or any FIRE artifacts are still valid. Five categories of detection were identified:

1. **Belief/hypothesis invalidation** — North Star `belief_challenges[].monitoring`, Strategy Formula `risks[].monitoring`, Roadmap `riskiest_assumptions[].confidence`. These monitoring directives exist in READY schemas but nothing in AIM consumes them.
2. **Maturity/status progression stalls** — Value Model L3 maturity, Feature Definition `feature_maturity.overall_stage`. AIM doesn't compare maturity across cycles.
3. **Cross-reference integrity** — Features reference value model paths via `contributes_to[]`, assumptions link to KRs via `linked_to_kr[]`, features reference each other via `dependencies`. AIM doesn't validate these.
4. **Freshness decay** — North Star `last_reviewed`/`next_review` (yearly), Insight Analyses `next_review_date` (3-6 months), Feature `last_assessment_date` (90 days). AIM doesn't flag staleness.
5. **Confidence/priority drift** — Multiple artifacts have `confidence_level` fields. Market conditions shift these but AIM has no re-evaluation mechanism.

**Why a new artifact instead of expanding existing AIM schemas:** The Assessment Report is purpose-built for roadmap cycle evaluation (OKRs + assumptions). Adding cross-artifact health checks would overload it and make it less focused. The SRC serves a different purpose: it asks "are the foundations still valid?" rather than "did we execute well this cycle?" The SRC's `recalibration_plan` feeds into the Calibration Memo as evidence, completing the information chain: SRC (what's wrong) → Calibration Memo (what to do) → `aim recalibrate` (apply it).

**Why organized by detection type, not by artifact:** Organizing by artifact (e.g., "North Star findings", "Insight Analyses findings") would scatter related signals. A weakening belief in the North Star often correlates with competitive changes detected in Insight Analyses and confidence drift in Strategy Formula. Grouping by detection type surfaces these cross-artifact patterns.

**Key structural decisions:**
- Every finding links to a specific `source_artifact` file path and `field_path`, making it traceable and actionable
- Simple signal vocabulary: `strengthening/holding/weakening/invalidated` for beliefs, `low/medium/high/critical` for staleness, `valid/broken/stale` for cross-references
- `recalibration_plan` is the primary output section — prioritized list with effort estimates, directly consumable by Phase 2's `aim recalibrate` command
- `aim generate-src` auto-populates mechanical checks (freshness dates, cross-reference validation, maturity mismatches); subjective sections are left as TODOs for AI/human judgment

**Alternative considered:** Expanding the Assessment Report and Calibration Memo schemas to include cross-artifact evaluation sections. Rejected because it conflates two different concerns (cycle execution evaluation vs. foundation validity) and would require all existing assessment/calibration tooling to handle the expanded scope.

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| Phase 4 depends on AI Strategy Agent which doesn't exist yet | Phases 1-3 are fully standalone; Phase 4 tasks define clear integration points |
| Recalibration changeset format may not cover all READY artifact variations | Start with the most common patterns (track focus changes, assumption updates, OKR adjustments); extend as needed |
| Metric YAML files could proliferate in git | Add retention policy to trigger config (keep N weeks of metrics, prune older ones) |
| Write-back commands change AIM artifacts, risking data loss | All writes append to evolution log; `aim archive-cycle` creates snapshots before modifications |
| SRC mechanical checks may produce false positives (e.g., flagging valid cross-references as broken due to path format variations) | Start with strict matching, add normalization rules as edge cases appear. False positives are preferable to false negatives for foundation validity |
| Canonical EPF repo (`epf-canonical`) and `epf-cli` embedded content drift apart | Enforce workflow: canonical first, sync, then build. CI clones canonical at build time. Never edit `internal/embedded/` directly |

## Open Questions

- Should probe reports be a new canonical artifact type with their own schema, or are they ephemeral output (like the track health signals)?
- What is the minimum set of READY artifacts that `aim recalibrate` should support in Phase 2? (Start with roadmap_recipe + strategy_formula, or all 7 including the ones SRC evaluates?)
- Should the monitoring goroutine in the MCP server be opt-in via a config flag, or always-on when the server has a trigger config?
- Should `aim generate-src` run all 5 detection categories by default, or accept a `--categories` flag to run a subset? (Full runs may be slow for large instances)
