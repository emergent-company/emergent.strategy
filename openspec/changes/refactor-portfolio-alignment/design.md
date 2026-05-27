## Context

The FIRE phase has a "Generate value models" / "Re-align value models" button
that currently invokes the `align-portfolio` LLM skill. This skill produces
wholesale replacement payloads for all four tracks, destroying human-authored
Product content and generating generic skeletons for canonical tracks.

The canonical EPF data model already contains the information needed to determine
which value model components should be active:

- **Roadmap KRs** have `value_model_target` fields referencing specific L3
  sub-components by `component_path` (e.g. `orgops-l1-talent-management.orgops-c-onboarding.orientation-programs`)
- **Canonical value model templates** define the full component taxonomy for
  Strategy (36 L3), Org & Ops (97 L3), and Commercial (41 L3)
- **Product value models** are user-authored and must never be auto-modified

## Goals / Non-Goals

### Goals

- Replace the LLM-based align-portfolio with deterministic Go code
- Activate value model components across all four tracks based on roadmap KR targets
- Provide a dry-run preview before staging mutations
- Show per-track alignment status in the FIRE dashboard
- Guarantee structural preservation — only `active` and `activation_notes` change

### Non-Goals

- Product value model genesis (handled by product-architect / lean-start agents)
- Product value model editing (manual via MCP tool or future UI)
- Definition activation/tier changes (separate concern, future work)
- Modifying the canonical `align-portfolio` skill in epf-canonical (upstream issue)

## Decisions

### 1. Deterministic activation over LLM generation

The `AlignPortfolio` operation is pure Go code. It walks the roadmap KRs,
collects `value_model_target` references, and sets `active` flags accordingly.
No LLM call. This follows the same principle as the calibration decision formula.

**Alternatives considered:**
- Keep LLM but improve the prompt (rejected: still non-deterministic, still
  risks destroying content on bad output)
- Use LLM only for activation_notes text (rejected: the KR description itself
  is sufficient rationale, no need for LLM prose)

### 2. All tracks are aligned, including Product

Activation is orthogonal to structure. A large Product value model may have
40+ sub-components but only 10 are being worked on for the MVP. The alignment
operation sets `active: true` on the 10 targeted by KRs and `active: false`
on the rest. No structural changes — layers, components, IDs, names,
descriptions, UVPs, and maturity data are preserved byte-for-byte.

### 3. Component path resolution

KR `value_model_target.component_path` uses dot-separated L1/L2/L3 IDs
(e.g. `orgops-l1-talent-management.orgops-c-onboarding.orientation-programs`).
The resolver walks the value model layers and matches by `id` at each level.
Unresolvable paths are logged as warnings but do not fail the operation.

### 4. Activation propagation is bottom-up

- L3 is active when targeted by at least one KR
- L2 is active when at least one child L3 is active
- L1 is active when at least one child L2 is active
- Track-level `status` is not changed (remains "active")

### 5. Auto-commit everywhere — no manual trigger

Portfolio alignment is deterministic and structure-safe — given the same KRs,
it always produces the same activation state. This makes it safe to auto-commit
in all contexts:

- **AIM cycle:** runs after `adapt_strategy` commits, auto-commits
- **Periodic consistency check:** runs from heartbeat, auto-commits any drift

There is no manual "align" button. The FIRE dashboard shows alignment status
(read-only). If alignment is wrong, the user fixes the roadmap KR targets
(the source of truth) and the next consistency check or AIM cycle corrects it.

### 6. Idempotent and no-op aware

The alignment step is idempotent. Running it twice with the same roadmap
produces no mutations (the no-op detection at step 3g skips unchanged tracks).
The periodic consistency check can run every heartbeat tick without cost.

### 7. Consistency check is broader than alignment

The periodic consistency check is a general-purpose instance health repair.
Value model alignment is one check among several:

| Check | What it fixes | Auto-commit? |
|-------|--------------|--------------|
| Value model alignment | `active` flags drift from KR targets | Yes |
| Missing canonical definitions | Tracks with 0 definitions | Yes |
| Stale skill runs | Runs stuck in `running` >10 min | Yes (mark failed) |
| Orphaned staged mutations | Batches staged >24h without review | No (warn only) |

All repairs are deterministic and structure-safe. The check is idempotent —
running it on a healthy instance produces no mutations.

## Data Flow

### AlignPortfolio operation

```
roadmap_recipe (committed artifact)
  └── tracks.{product,strategy,org_ops,commercial}
        └── okrs[].key_results[]
              └── value_model_target
                    ├── track: "org_ops"
                    ├── component_path: "orgops-l1-talent-management.orgops-c-onboarding.orientation-programs"
                    └── target_maturity: "emerging"

AlignPortfolio(instanceID, autoCommit bool)
  1. Load committed roadmap_recipe
  2. Extract all value_model_target refs, grouped by track
  3. For each track (product, strategy, org_ops, commercial):
     a. Load committed value_model artifact(s) for this track
     b. Walk layers → components → sub_components
     c. Set active=true on targeted L3s, active=false on others
     d. Write activation_notes: "Targeted by KR {kr_id}: {kr_description}"
     e. Propagate active upward to L2 and L1
     f. Preserve all other fields (structure, IDs, names, descriptions, UVPs, maturity)
     g. Stage as update mutation only if activation state actually changed
  4. If autoCommit: commit the batch immediately (AIM cycle path)
  5. Return alignment summary (per-track: activated count, deactivated count, KR coverage)
```

### AIM cycle integration

```
AIM Orchestrated Cycle (existing steps + new step):
  1. draft_assessment        — LLM skill, staged, human review
  2. draft_calibration       — LLM skill, staged, human review
  3. adapt_strategy          — LLM skill (chunked), staged, human review
     └── modifies: strategy_formula, roadmap_recipe (KRs may change)
  4. align_portfolio  (NEW)  — deterministic, auto-committed
     └── reads: committed roadmap_recipe (from step 3)
     └── modifies: value_model active flags only
  5. snapshot_cycle           — publish version snapshot
```

The alignment step runs after `adapt_strategy` is committed because it reads
the newly committed roadmap KRs. It auto-commits because the operation is
deterministic and structure-safe — only `active` flags change.

### Periodic consistency check

```
Heartbeat ticker (runs every evaluation interval, currently 24h)
  └── For each instance:
        1. RunConsistencyCheck(instanceID)
           ├── AlignPortfolio — sync active flags to KR targets
           ├── InstallMissingDefinitions — backfill canonical defs
           ├── CleanStaleRuns — mark stuck skill_runs as failed
           └── WarnOrphanedBatches — log aged staged mutations
        2. Record check result in activity log
```

The consistency check is wired into the existing heartbeat evaluation loop
(`domain/heartbeat/`). It runs after trigger evaluation, for all instances,
regardless of whether a cycle was proposed. Each sub-check is independent —
a failure in one does not block others.

## Risks / Trade-offs

- **Risk:** KRs may not have `value_model_target` populated yet (field is optional
  in the schema). **Mitigation:** The operation reports coverage — if 0 KRs have
  targets, it explains that alignment requires populated `value_model_target` fields
  and does not stage any mutations.

- **Risk:** Component path in KR may not resolve to an existing L3 in the value model
  (typo, schema version mismatch). **Mitigation:** Unresolvable paths are logged as
  warnings and included in the alignment summary for user visibility. The operation
  continues with resolvable paths.

- **Trade-off:** No LLM means no "creative" activation suggestions. The system only
  activates what the roadmap explicitly targets. This is intentional — speculative
  activation is what caused the original problem.

## Open Questions

- Should the alignment also set `maturity.stage` based on `value_model_target.target_maturity`?
  Current proposal: no, maturity is evidence-based and should be updated via the AIM cycle
  assessment, not during alignment. But this could be revisited.

- Should the FIRE dashboard show a "missing value_model_target" warning per KR to
  encourage roadmap authors to populate the field?
