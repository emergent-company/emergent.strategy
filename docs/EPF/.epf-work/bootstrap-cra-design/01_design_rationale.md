# Bootstrap & Living Reality Design Rationale

## Problem Statement

EPF has a **cold start problem**: The READY-FIRE-AIM cycle assumes AIM data exists from prior cycles, but the first READY cycle has no prior AIM to build from.

**Current situation:**
- Wizards (Pathfinder, Lean Start) begin with INSIGHT phase analysis
- No structured way to capture "current reality" for existing products/orgs
- Track health monitoring doesn't exist until assessments accumulate

## Design Evolution: From Snapshot to Living Document

**Original thinking:** CRA as bootstrap-only artifact → THA takes over → CRA becomes stale
**Problem:** Dead artifacts violate emergence principle; snapshot becomes residue

**Revised thinking:** CRA and THA are the **same concept at different lifecycle stages**

```
Cycle 0 (Bootstrap)    →    Cycle 1-N (Ongoing)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRA (initial capture)  →    CRA (continuously updated)
                            ↑
                       THA signals flow in
```

**Key insight:** CRA is the **ground truth about current reality** that keeps evolving. Track Health signals are the **mechanism** for updating it, not a separate artifact.

## Design Goals

1. **Bootstrap gracefully** - Enable Cycle 0 without prior AIM data
2. **Evolve through emergence** - CRA updates continuously, never becomes stale
3. **Lightweight at start** - 5-minute minimum, progressive depth over time  
4. **Scale invariant** - Same conceptual model from solo founder to product org
5. **AI-first** - Designed for agent execution, not manual process

## Unified Artifact: Living Reality Assessment

### Lifecycle Model

```
┌─────────────────────────────────────────────────────────────────┐
│                    LIVING REALITY ASSESSMENT                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │   BOOTSTRAP  │ ──► │   MATURING   │ ──► │   EVOLVED    │    │
│  │   (Cycle 0)  │     │  (Cycle 1-3) │     │  (Cycle 4+)  │    │
│  └──────────────┘     └──────────────┘     └──────────────┘    │
│                                                                  │
│  Initial capture      Signals enrich     Full emergence         │
│  Manual collection    Mixed sources      Agent-maintained       │
│  Best guesses         Validated reality  Evidence-based         │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  Stable Context        │  Evolving Context                      │
│  ───────────────────   │  ─────────────────                     │
│  • Adoption context    │  • Track baselines (updated by THA)    │
│  • Organization type   │  • Existing assets (updated as built)  │
│  • Hard constraints    │  • Constraints (validated/invalidated) │
│                        │  • Focus allocation (rebalanced)       │
└─────────────────────────────────────────────────────────────────┘
```

### What Stays Stable vs What Evolves

| Section | Bootstrap | Evolution Pattern |
|---------|-----------|-------------------|
| `adoption_context.organization_type` | Set once | Rarely changes (reorg trigger) |
| `adoption_context.team_size` | Initial | Updates as team grows |
| `adoption_context.ai_capability_level` | Initial | Upgrades as agents mature |
| `track_baselines` | Initial guess | **Core evolution target** - THA signals update |
| `existing_assets` | Inventory | Updates as assets are built/acquired |
| `constraints.hard_constraints` | Known limits | Some resolve, some emerge |
| `constraints.operating_assumptions` | Initial beliefs | Validated/invalidated over cycles |
| `initial_focus` | Cycle 1 plan | Becomes `current_focus` each cycle |

### Track Health as Update Mechanism

THA is not a separate artifact - it's the **signal collection process** that updates CRA:

```yaml
# Each AIM cycle:
1. Synthesizer collects track health signals
2. Signals compared to current CRA.track_baselines
3. CRA.track_baselines updated where signals indicate change
4. CRA.evolution_log captures what changed and why
5. Updated CRA informs next READY cycle
```

### Evolution Log (New Section)

CRA gains an `evolution_log` section tracking how it changed:

```yaml
evolution_log:
  - cycle: "2025-Q1"
    changes:
      - section: "track_baselines.org_ops"
        previous: { maturity: "implicit", status: "emerging" }
        current: { maturity: "explicit", status: "established" }
        trigger: "Hired ops lead, established sprint process"
      - section: "adoption_context.ai_capability_level"
        previous: "ai_assisted"
        current: "ai_first"
        trigger: "Agent swarm handling 80% of code generation"
```

## Signal Vocabulary (Unchanged)

Simple qualitative signals for track health updates:
- **velocity_signal**: accelerating | stable | slowing | blocked
- **quality_signal**: excellent | healthy | degrading | critical
- **attention_backlog**: clear | manageable | growing | blocking
- **capacity_utilization**: underutilized | optimal | stretched | overloaded

## Track Maturity Levels (Unchanged)

- **absent** - Track not started (acceptable at early stages)
- **implicit** - Track happening but not structured
- **explicit** - Track has defined structure/process
- **measured** - Track has metrics and feedback loops
- **optimized** - Track continuously improving

## Progressive Disclosure (Unchanged)

```
Level 0 (Solo): 5 min bootstrap → 1-track focus → minimal evolution
Level 1 (Small): 15 min bootstrap → 2-track awareness → light evolution
Level 2 (Growing): 30 min bootstrap → 4-track coverage → full evolution
Level 3 (Product Org): 45 min bootstrap → full depth → rich evolution
```

## Implementation Approach (Revised)

### Phase 1: Schema Files (This Session)
1. ~~Create `current_reality_assessment_schema.json`~~ ✅ (needs evolution additions)
2. ~~Create `track_health_assessment_schema.json`~~ ✅ (becomes signal collection spec)
3. **Update CRA schema** with `evolution_log` and lifecycle metadata

### Phase 2: Bootstrap Wizard (Next Session)
1. Create `bootstrap.agent_prompt.md` wizard
2. Integrate with Lean Start and Pathfinder entry points
3. Explain CRA as living document, not one-time snapshot

### Phase 3: Evolution Integration (Future)
1. Update Synthesizer to collect THA signals AND update CRA
2. Add evolution_log writing to AIM workflow
3. CRA becomes input to every READY cycle (not just Cycle 0)

## Resolved Questions

1. **CRA persistence** - Lives in `AIM/` as the living reality document
   - File: `AIM/current_reality.yaml` (not `baseline/` - it's active, not archived)
   
2. **THA as separate artifact?** - No, THA is signal collection process
   - THA schema defines signal vocabulary and collection
   - Signals update CRA, not stored separately
   
3. **Agent capability tracking** - Part of `adoption_context.ai_capability_level`
   - Evolves as agent capabilities mature
   - Logged in evolution_log when level changes
