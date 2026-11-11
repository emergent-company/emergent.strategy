# Work Package Creation Wizard

**Schema Version:** 1.1.0
**Purpose:** Step-by-step guidance for authoring EPF-compliant work packages — the bounded, non-permanent execution units that bind strategy to execution.

---

## What a Work Package Is (and Is Not)

A **work package (WP)** is the tool-agnostic, four-track **handover contract** between
strategy authoring and downstream execution. It binds stable strategy
(Value Model L1–L3 → Definitions → Key Results) into a scoped statement of work
with a clear outcome and a time-box.

| A work package IS | A work package IS NOT |
|---|---|
| A thin binding of references | A copy of strategy content |
| A statement of OUTCOME + TARGETS | A task list or backlog |
| Time-boxed and disposable | A permanent record |
| Substrate-agnostic | Tied to one execution tool |
| A contract | A ticket (this is why pre-v1.9.6 `work_packages` was removed) |

### Two places a work package can originate

| Origin | `source.authoring_tool` | Where it is written | Typical use |
|---|---|---|---|
| **EPF-authored** | `custom`, `partner-native` | In EPF, before execution (a statement-of-work handover) | Org-ops, commercial and partner work |
| **Implementation-authored** | `openspec` | In the code repository, once the implementation spec exists; mirrored one way into EPF | Product and code work |

For implementation-authored work packages, EPF holds a **read-only mirror**.
`source.reference` points to the tracker item (for example a GitHub issue URL),
and execution detail (estimates, tasks, repos, PRs) stays in the tracker. Do not
edit a mirrored work package in EPF; change it at its source. The steps below
describe authoring a work package in EPF (the first origin); the mirror must
still satisfy the same schema.

**Golden rule:** if you are writing implementation steps, you are writing the
execution substrate's decomposition — not the work package. Stop and keep the WP thin.

---

## Pre-Authoring Checklist

Before starting, ensure you have:

- [ ] A clear, bounded **outcome** (not an activity list) the WP will deliver
- [ ] Identified the **primary track** (product / strategy / org_ops / commercial)
- [ ] The **Value Model paths** (L1.L2.L3) this WP advances — these must already exist
- [ ] The **definition ids** (fd/sd/pd/cd) this WP operates against — must already exist
- [ ] The **Key Result ids** (kr-{p|s|o|c}-NNN) this WP advances — must already exist
- [ ] A view on **risk** (low / medium / high) — drives downstream review rigor
- [ ] A **target close date** if known — a WP is time-boxed, not eternal

---

## Step 1 — Identity (`id`, `title`)

- `id`: format `wp-NNN` (e.g. `wp-001`). The `wp-` prefix is cross-track **by design** —
  a WP can span tracks, so it does not use per-track prefixes. IDs are immutable.
- `title`: outcome-oriented, Title Case, 3–80 chars.

✅ `CSV Import Hardening`  ❌ `Do the import work`

## Step 2 — Intent (`intent`)

State the **bounded outcome**, 20–600 chars. Answer: *what will be true when this WP is done?*

### ❌ WRONG — a task list
```yaml
intent: "Add streaming parser, write tests, update docs, deploy."
```

### ✅ CORRECT — a bounded outcome
```yaml
intent: >-
  CSV import succeeds for files up to 100MB with clear, recoverable errors,
  so that onboarding no longer stalls on data import.
```

## Step 3 — Track (`track`)

Pick the **primary** track for ownership/routing: `product | strategy | org_ops | commercial`.
Cross-track value is expressed in `targets.value_model_paths`, not here.

## Step 4 — Targets (`targets`) — the binding

All three arrays are **many-to-many references** into existing strategy artifacts.
A WP advances multiple KRs; a KR spans multiple WPs. (1:1 was rejected — WPs would
grow too large and KRs too numerous to stay meaningful.)

```yaml
targets:
  value_model_paths:
    - "Product.Core Platform.csv-import"        # {Track}.{Segment}.{Segment}[.{Segment}]
  definition_ids:
    - "fd-001"                                  # fd/sd/pd/cd-NNN
  kr_ids:
    - "kr-p-001"                                # kr-{p|s|o|c}-NNN
```

**Format rules:**
- `value_model_paths`: Track is **Title case** (`Product|Strategy|OrgOps|Commercial`),
  followed by **2 or 3** further segments (3-4 in total). Segments may be display
  names (`Core Platform`, `csv-import`) or PascalCase (`CorePlatform`, `CsvImport`);
  spaces, `&`, parentheses, `/`, `,` and `'` are allowed. The pattern is the same as
  feature definition `contributes_to`, so a path can be copied from a feature unchanged.
- `definition_ids`: `fd-` product, `sd-` strategy, `pd-` org_ops, `cd-` commercial.
- `kr_ids`: `kr-p/s/o/c-NNN`.

**Footprint (do not author):** the orchestrator derives the WP's footprint as the
**union of `value_model_paths` + `definition_ids`** and uses it as the four-track
collision key for parallel-safe waves. You only author the targets; the footprint
is computed server-side so it cannot be under-declared.

### ❌ WRONG — inventing a task model inside targets
```yaml
targets:
  tasks: ["build streaming parser"]   # rejected by schema (additionalProperties: false)
```

## Step 5 — Risk (`risk_class`)

`low` (auto-reviewable) | `medium` (human review) | `high` (strict review + sign-off).
This declaration drives the downstream review gate; the schema does not enforce behavior.

## Step 6 — Status (`status`)

Normal flow: `proposed → approved → scheduled → executing → done`.
Tools that mirror a work package from an implementation tracker must never move
its status backward along this flow; status only advances (or becomes `cancelled`).
`cancelled` is a terminal state reachable from any non-terminal state — this honors
the "not forever" property (mirrors Shape-Up's "rejected"). New WPs typically start
at `proposed`. The transition state-machine is enforced downstream, not here.

## Step 7 — Source (`source`)

```yaml
source:
  authoring_tool: "custom"     # custom | partner-native (EPF-authored); openspec (implementation-authored mirror)
  # reference: "spec:csv-import-hardening"   # optional pointer; for a mirror, the tracker item URL
```
Use **categories**, never specific product names (canonical purity).

## Step 8 — Lifecycle (`lifecycle`)

```yaml
lifecycle:
  created_at: "2026-01-15T09:00:00Z"   # ISO 8601, required
  target_close: "2026-02-28"           # optional time-box
  # closed_at:  set by the substrate on done/cancelled
```

---

## Validate

```bash
# Schema validation
./scripts/validate-schemas.sh path/to/work_package.yaml

# Relationship validation — every target must resolve to a real
# value-model path / definition id / KR id
./scripts/validate-work-package-references.sh path/to/work-packages-dir/
```

---

## Common Mistakes to Avoid

1. **Writing tasks/steps** in `intent` or inventing `tasks` under `targets`.
   → The substrate owns decomposition. Keep the WP a thin contract.
2. **Authoring a footprint field.** → It is derived server-side; only author targets.
3. **Forcing 1:1 KR mapping.** → Targets are many-to-many on purpose.
4. **Using product names** in `source.authoring_tool` or in prose. → Categories only. (`source.reference` may be a tracker URL.)
5. **Treating the WP as permanent.** → Set a `target_close`; use `cancelled` when dropped.
6. **Per-track id prefix** (e.g. `fd-...`). → WPs use the cross-track `wp-` prefix.
