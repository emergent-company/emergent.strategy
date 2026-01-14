# Living Reality Assessment - Integration Summary

> **Key Insight:** CRA and THA are the same concept at different lifecycle stages. CRA is the persistent "source of truth" that evolves through emergence. THA is the signal collection mechanism that updates it.

## What Was Created

### 1. Living Reality Assessment Schema (née CRA)
**File:** `docs/EPF/schemas/current_reality_assessment_schema.json`

**Purpose:** Persistent, evolving document that captures and maintains current reality across all tracks. Starts as bootstrap artifact (Cycle 0), evolves through emergence.

**Key Sections:**
- `metadata` - Lifecycle tracking (lifecycle_stage, cycles_completed, last_updated, last_updated_by)
- `adoption_context` - Org type, funding, team size, AI capability level, bottleneck
- `track_baselines` - Maturity/status for each track (absent → implicit → explicit → measured → optimized)
- `existing_assets` - Inventory of code, docs, customers, processes
- `constraints` - Hard constraints and operating assumptions
- `capability_gaps` - Known gaps with mitigation status (NEW: tracks progress)
- `current_focus` - Where attention is allocated NOW (evolves each cycle)
- `evolution_log` - **NEW:** History of all changes through emergence cycles

**Lifecycle Stages:**
```
bootstrap (Cycle 0)     → Initial creation, all sections populated
       ↓
maturing (Cycles 1-3)   → Track baselines updating via THA signals
       ↓
evolved (Cycles 4+)     → Rich history, pattern recognition possible
```

### 2. Track Health Assessment Schema (Signal Collection)
**File:** `docs/EPF/schemas/track_health_assessment_schema.json`

**Purpose:** Ephemeral signal collection mechanism used during each AIM cycle to update the Living Reality Assessment.

**Key Sections:**
- `tracks` - Health signals per track using simple vocabulary:
  - `velocity_signal`: accelerating | stable | slowing | blocked
  - `quality_signal`: excellent | healthy | degrading | critical
  - `attention_backlog`: clear | manageable | growing | blocking
  - `capacity_utilization`: underutilized | optimal | stretched | overloaded
- `coherence_assessment` - Cross-track balance analysis
- `signal_sources` - Where signals came from (quality tracking)
- `recalibration_signals` - Triggers for out-of-cycle AIM

**Relationship to CRA:**
```
Each AIM Cycle:
  1. Collect THA signals from execution domains
  2. Compare signals to CRA track_baselines
  3. If significant delta detected:
     - Update CRA track_baselines
     - Update CRA current_focus if needed
     - Append entry to CRA evolution_log
  4. THA discarded; CRA persists with richer history
```

## Living Document Flow

### Lifecycle: Bootstrap → Mature → Evolve

```
┌─────────────────────────────────────────────────────────────────┐
│                         BOOTSTRAP (Cycle 0)                      │
├─────────────────────────────────────────────────────────────────┤
│  New EPF Adoption                                                │
│        ↓                                                         │
│  Bootstrap Wizard collects CRA (5-45 min by adoption level)     │
│        ↓                                                         │
│  CRA saved: AIM/baseline/living_reality_assessment.yaml         │
│        ↓                                                         │
│  lifecycle_stage: bootstrap, cycles_completed: 0                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                         MATURING (Cycles 1-3)                    │
├─────────────────────────────────────────────────────────────────┤
│  Each AIM cycle:                                                 │
│    1. Synthesizer collects THA signals                          │
│    2. Compares to CRA track_baselines                           │
│    3. Updates CRA if significant deltas                         │
│    4. Appends to evolution_log                                  │
│        ↓                                                         │
│  lifecycle_stage: maturing, cycles_completed: N                  │
│  evolution_log grows with each update                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                         EVOLVED (Cycles 4+)                      │
├─────────────────────────────────────────────────────────────────┤
│  Rich history enables:                                           │
│    - Pattern recognition ("we always slow in Q4")               │
│    - Trend analysis ("commercial track degrading over 3 cycles")│
│    - Predictive insights ("based on history, expect...")        │
│        ↓                                                         │
│  lifecycle_stage: evolved                                        │
│  CRA becomes strategic institutional memory                      │
└─────────────────────────────────────────────────────────────────┘
```

### What Evolves vs What Stays Stable

| Section | Stability | Update Pattern |
|---------|-----------|----------------|
| `metadata` | Semi-stable | Updated each cycle (last_updated, cycles_completed) |
| `adoption_context` | Stable | Only updates on significant org changes |
| `track_baselines` | **Evolving** | Updated by THA signals each cycle |
| `existing_assets` | Stable | Updates as new artifacts created |
| `constraints` | Stable | Updates only on hard constraint changes |
| `capability_gaps` | **Evolving** | Gaps mitigated, new ones discovered |
| `current_focus` | **Evolving** | Attention rebalances each cycle |
| `evolution_log` | Append-only | New entry each time CRA changes |

## How These Integrate with Existing EPF

### Relationship to Existing Schemas

| New Schema | Relates To | Relationship |
|------------|------------|--------------|
| CRA | `aim_trigger_config_schema.json` | CRA uses same `adoption_level` (0-3) |
| CRA | `assessment_report_schema.json` | CRA track_baselines updated by assessment insights |
| CRA | `north_star_schema.json` | CRA informs North Star development |
| THA | `assessment_report_schema.json` | THA collected alongside OKR assessments |
| THA | `aim_trigger_config_schema.json` | THA signals can trigger recalibration |
| THA | `roadmap_recipe_schema.json` | THA connects to `cross_track_dependencies` |

### File Structure

```
docs/EPF/
├── schemas/
│   ├── current_reality_assessment_schema.json  ← Living Reality Assessment
│   ├── track_health_assessment_schema.json     ← Signal Collection
│   ├── assessment_report_schema.json           (existing)
│   └── aim_trigger_config_schema.json          (existing)
│
└── _instances/emergent/
    └── AIM/
        ├── assessments/
        │   └── C1_track_health_signals.yaml    ← THA (ephemeral)
        └── baseline/
            └── living_reality_assessment.yaml  ← CRA (persistent)
```

## Progressive Disclosure by Adoption Level

### Bootstrap Collection Time

| Level | Team Size | Bootstrap Time | Track Coverage |
|-------|-----------|----------------|----------------|
| 0 | 1-2 | 5 min | Product only |
| 1 | 3-5 | 15 min | Product + 1 secondary |
| 2 | 6-15 | 30 min | All 4 tracks |
| 3 | 15+ | 45 min | All 4 tracks + full depth |

### THA Signal Depth per Cycle

| Level | Track Coverage | Coherence Analysis | CRA Update Frequency |
|-------|----------------|-------------------|---------------------|
| 0 | Product only | None | When significant changes |
| 1 | Product primary | Basic (2 tracks) | Each cycle if delta |
| 2 | All 4 tracks | Full coherence | Each cycle |
| 3 | All 4 tracks | Full + dependencies | Each cycle + trends |

## Design Principles

1. **Living Document** - CRA is never "done", it evolves with the organization
2. **Signal-Driven Updates** - Changes flow from THA observations, not assumptions
3. **Append-Only History** - evolution_log never deletes, enabling pattern analysis
4. **Progressive Depth** - More detail at higher adoption levels
5. **AI-First** - Designed for agent collection, simple signal vocabulary
6. **Non-Invasive** - Signals flow IN from execution, don't try to manage operations

## Evolution Log Triggers

| Trigger | When Used | Example |
|---------|-----------|---------|
| `bootstrap_complete` | Initial CRA creation | "First CRA created during onboarding" |
| `aim_signals` | THA detects significant delta | "Strategy track velocity slowing for 2 cycles" |
| `external_change` | Market/funding/team change | "Series A closed, team growing from 3 to 8" |
| `milestone_reached` | Significant achievement | "First paying customer acquired" |
| `constraint_change` | Hard constraint shifts | "Runway extended by 6 months" |
| `manual_update` | Ad-hoc correction | "Updated asset inventory after audit" |

## Next Steps

### Phase 2: Bootstrap Wizard
1. Create `docs/EPF/wizards/bootstrap.agent_prompt.md`
2. Collect initial CRA with lifecycle_stage: bootstrap
3. Set up first evolution_log entry with trigger: bootstrap_complete

### Phase 3: Synthesizer Integration
1. Update Synthesizer agent to collect THA during AIM
2. Compare THA signals to CRA track_baselines
3. Update CRA and append evolution_log when significant deltas detected
4. Connect THA to recalibration triggers

### Phase 4: Pattern Recognition
1. Analyze evolution_log for recurring patterns
2. Add trend detection to AIM insights
3. Predictive recommendations based on history

## Resolved Design Questions

1. **CRA versioning** - ✅ Living document with evolution_log, not historical snapshots
   - Why: Avoids "dead residue", enables pattern analysis, single source of truth

2. **CRA vs THA relationship** - ✅ Same concept, different lifecycle stages
   - THA: ephemeral signal collection
   - CRA: persistent evolved state

3. **When to update CRA** - ✅ When THA signals show significant delta from baselines
   - Threshold: Any signal moving 2+ levels (e.g., stable → blocked)
   - Or: Coherence status changing (healthy → warning → critical)
   - Or: External trigger (team size change, funding, pivot)
