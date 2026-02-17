## Context

An AI agent created 5 value models for Huma Group that were structurally valid but semantically wrong — organized as product catalogs (layers named after products) instead of value-generation models (layers describing how value flows). Every validation check passed. The error was caught by the user's domain expertise.

Value models are the foundational artifact in EPF — features, roadmaps, KRs, coverage analysis, and generated outputs all depend on them. A semantically wrong value model poisons the entire downstream chain.

EPF currently validates structure extensively (JSON Schema, path resolution, content readiness, relationship integrity) but has zero semantic validation. The product-catalog anti-pattern — the most fundamental structural error a value model can have — is completely undocumented and undetectable.

### Constraints
- Semantic quality cannot be fully enforced by schema or static analysis — it requires heuristics
- Heuristics must be advisory (warnings/info), not blocking errors — there will be false positives
- All documentation changes go into `apps/epf-cli/internal/embedded/` (the single source of truth for epf-cli)
- The canonical-epf repo (`docs/EPF/`) receives changes separately; this change focuses on epf-cli
- Must not break existing value model validation for instances that are correctly structured
- `product_portfolio.yaml` may not exist in all instances — all checks must degrade gracefully

### Stakeholders
- AI agents — primary consumers of value model guidance (via wizards, AGENTS.md, MCP tools)
- Founder/CEO — reviews value models and catches semantic errors that tooling misses
- EPF CLI — the enforcement point for all validation

## Goals / Non-Goals

### Goals
- Document the product-catalog anti-pattern with the same rigor as language anti-patterns
- Add heuristic detection that flags likely product-catalog structures
- Integrate quality signals into health check and MCP tool output
- Ensure AI agents see structural guidance during value model creation
- Refine terminology: "categories of value delivery" instead of only "value-generation stages" (canonical models use both sequential flows and functional decomposition)

### Non-Goals
- Blocking value model creation based on heuristic analysis (warnings only)
- LLM-assisted semantic review (Phase 4 is design-only, no implementation)
- Fixing existing value models in other repos (each instance owner's responsibility)
- Changes to JSON Schema specification (semantic quality is beyond schema's capability)
- Unifying the two Go type systems for value models (separate concern, out of scope)

## Decisions

### Decision 1: Terminology — "Categories of value delivery" not just "value-generation stages"

**Decision**: Use "categories of value delivery" as the primary term, with "value-generation stages" as one valid organizing principle alongside "functional decomposition."

**Rationale**: Analysis of all 4 canonical track value models reveals they do NOT all use sequential stages:
- **Strategy**: Sequential flow (CONTEXT -> STRATEGIC ROADMAP -> TACTICAL ROADMAP -> COMMUNICATIONS)
- **OrgOps**: Functional decomposition (7 parallel departmental domains)
- **Commercial**: Functional decomposition (4 parallel market-facing domains)
- **Product**: Custom per company (examples show deployment tiers, maturity stages, architectural separation)

The common thread across all valid models is that **layers represent categories of value delivery, never products/brands/offerings**. The anti-pattern is specifically naming layers after things in your product portfolio.

### Decision 2: Build semantic validation on `internal/valuemodel/` types, not `internal/strategy/` types

**Decision**: All new quality/semantic code builds on the full `internal/valuemodel/` package (loader.go types).

**Rationale**: The codebase has two parallel value model type systems:
- `internal/valuemodel/` — Full types with maturity, evidence, active flags, dual field names (`sub_components`/`subs`)
- `internal/strategy/` — Simplified projection (just ID, Name, Description, Maturity as string)

The strategy types are a lossy projection unsuitable for semantic analysis. Quality scoring needs access to full component metadata. The `internal/valuemodel/` package already has the loader, resolver, and maturity calculation — adding quality scoring there keeps the concern cohesive.

### Decision 3: New file `internal/valuemodel/quality.go` for all semantic heuristics

**Decision**: Create a single new file in the existing `internal/valuemodel/` package containing all quality-related heuristics (product-name collision, 1:1 mapping detection, layer name analysis, overlap detection).

**Rationale**: These heuristics are all about value model quality and share the same types. Keeping them in one file makes the scope clear and avoids scattering semantic checks across packages. The health check integration (`internal/checks/`) calls into this package.

**Alternatives considered**: (a) New `internal/semantics/` package — rejected because it would need to import valuemodel types anyway and adds indirection. (b) Spread across existing files — rejected because quality scoring is a distinct concern from loading/resolving/maturity.

### Decision 4: Health check integration at `internal/checks/`, not `internal/health/`

**Decision**: Integrate value model quality into `internal/checks/` package (the actual location of health check logic).

**Rationale**: The proposal referenced `internal/health/` which doesn't exist. The actual health check logic lives in `internal/checks/` — specifically `instance.go`, `relationships.go`, `features.go`, `coverage.go`, `crossrefs.go`, and `versions.go`. A new `valuemodel_quality.go` file in this package follows the existing pattern.

### Decision 5: Product-name sourcing — portfolio YAML + feature definition names

**Decision**: Extract reference names for collision detection from two sources:
1. `product_portfolio.yaml` — product names, brand names, offering names (primary source)
2. Feature definition file names and titles (secondary signal)

Both are optional — if neither exists, the product-name collision check is skipped gracefully with an info message.

**Rationale**: `product_portfolio.yaml` is the canonical source of product/brand names. Feature definitions provide a secondary signal because in a product-catalog model, FD names often match L2 component names exactly. Using both increases detection confidence.

### Decision 6: Scoring thresholds are advisory, not blocking

**Decision**: All quality checks emit WARNING or INFO level messages, never ERROR. The quality score is reported but does not cause health check failure.

**Rationale**: Heuristic analysis will have false positives. Legitimate value models may trigger individual checks (e.g., a small product with genuinely 1:1 feature mapping). The goal is to make the anti-pattern visible to humans and AI agents, not to block workflow. Over time, thresholds can be tuned based on real-world signal.

### Decision 7: Documentation lives in embedded files, not just canonical-epf

**Decision**: All documentation changes (anti-patterns guide, wizard updates, AGENTS.md updates, template comments) are made in `apps/epf-cli/internal/embedded/`. The canonical-epf repo is updated separately.

**Rationale**: AI agents working through epf-cli MCP tools only see embedded files. The canonical-epf repo (`docs/EPF/`) is a separate concern with its own update cadence. Our research confirmed that value model guides referenced in templates (`VALUE_MODEL_BUSINESS_LANGUAGE_GUIDE.md`, `VALUE_MODEL_MATURITY_GUIDE.md`) are NOT embedded — agents using MCP tools never see them. This change must not repeat that mistake.

### Decision 8: Execution order follows the proposal's 4 phases

**Decision**: Execute in proposal order: Phase 1 (Documentation) -> Phase 2 (Heuristics) -> Phase 3 (Scoring/Integration) -> Phase 4 (Design only).

**Rationale**: Phase 1 has immediate impact on AI agent behavior with zero code risk. Phase 2 creates the heuristic functions. Phase 3 wires them into the existing health check and MCP output. Each phase is independently valuable and can be shipped separately.

### Decision 9: Value Model Review Wizard — Separate Wizard, Optional, Hybrid Approach

**Status**: Design exploration (Phase 4) — no implementation planned yet.

**Questions explored**:
1. Should this be a separate wizard or an extension of product_architect?
2. Should it be mandatory (always run) or optional (agent judgment)?
3. Can it be effective without LLM reasoning (pure heuristics + templates)?

#### Question 1: Separate wizard vs. extension of product_architect

**Recommendation**: Separate wizard (`value_model_review.agent_prompt.md`).

**Rationale**: The product_architect wizard is already 484 lines and covers two distinct outputs (value models + feature definitions) plus schema v2.0 pre-creation validation. Adding a full review flow would push it past maintainability. More importantly, creation and review are fundamentally different cognitive modes:

- **Creation** (product_architect): Generates artifacts through dialogue. The agent needs domain expertise guidance, UVP formulas, template structure, and business-language rules. It writes files.
- **Review** (value_model_review): Evaluates existing artifacts against quality criteria. The agent needs access to `QualityReport` data, anti-pattern knowledge, and restructuring guidance. It reads files and produces recommendations.

The existing wizard inventory confirms this separation pattern:
- `product_architect` creates value models and feature definitions (FIRE creation)
- `balance_checker` reviews roadmap viability (READY review/gate)
- `synthesizer` reviews cycle outcomes (AIM review)

No existing wizard tries to be both creator and reviewer. The `balance_checker` is the closest analog — it reads artifacts, runs checks, produces a viability score, and provides remediation guidance. The value model review wizard would follow this pattern.

However, the product_architect wizard **should retain its existing inline self-check** (the "mandatory self-check after drafting" section at lines 48-55). This serves as a lightweight creation-time gate. The separate review wizard handles deeper post-creation analysis.

**Integration point**: The product_architect wizard's self-check section should reference the review wizard: "For comprehensive structural analysis, run the value model review wizard after writing the file."

#### Question 2: Mandatory vs. optional

**Recommendation**: Optional, with strong advisory nudges.

**Rationale**: Making it mandatory would require enforcement in the product_architect wizard (a process constraint on AI agents) or in the MCP server (blocking value model writes without a review). Neither is practical or aligned with EPF's philosophy:

- EPF treats all quality checks as advisory (Decision 6). A mandatory review wizard would be the only blocking semantic check.
- Agents may create value models in contexts where review is unnecessary (small updates, adding a sub-component, track models that follow canonical patterns).
- The `balance_checker` wizard — the closest analog — is optional. It's recommended before committing to FIRE, but agents decide when to invoke it.

Instead, the wizard should be **strongly recommended** through multiple channels:
1. The product_architect wizard's self-check section references it.
2. AGENTS.md includes guidance: "After creating or significantly modifying a value model, consider running the value model review wizard."
3. The `epf_get_wizard_for_task` recommender matches tasks like "review value model", "check value model quality", "validate my value model structure".
4. The health check output, when it detects quality warnings, suggests: "Run the value model review wizard for guided remediation."

**Future consideration**: If the anti-pattern recurs despite advisory nudges, a lightweight gate could be added — the `aim_trigger_assessment` pattern (10-30 minute ROI check) applied to value model creation. This would be a "should I do a full review?" check, not a blocking gate.

#### Question 3: Pure heuristics vs. LLM reasoning

**Recommendation**: Hybrid — heuristic data + LLM-guided interpretation.

**Rationale**: The wizard leverages two complementary capabilities:

**Heuristic layer (already built)**: `AssessQuality()` provides a `QualityReport` with 6 scored checks, specific warnings with details, and an overall score. This is fast, deterministic, and covers the measurable anti-pattern signals (name collisions, 1:1 mapping, L2 diversity, L3 distribution, layer name patterns, multi-file overlap).

**LLM reasoning layer (the wizard's contribution)**: The heuristics can detect _symptoms_ but cannot evaluate _intent_. An LLM-guided wizard adds:

- **Contextual judgment**: "Your L1 layer 'Thermal Management' scored well on name heuristics, but given your product portfolio includes a product literally called 'Thermal Manager', this may still be a product-catalog pattern." Heuristics alone would only catch this if the names matched closely enough.
- **Restructuring guidance**: "Your value model has 5 layers, each with exactly 1 component. Consider whether 'Heat Exchange' and 'Thermal Storage' are actually sub-categories of a broader 'Energy Management' layer." This requires understanding domain relationships that no heuristic can capture.
- **Domain-specific validation**: "You have a 'Service Delivery & Ops' layer — this is valid for a hardware company with service contracts. For a pure-software company, this might indicate a product-catalog layer disguised as a value stage." Context matters.
- **The litmus tests**: "If you removed the Io product entirely, would the 'Energy Transformation' layer still make sense?" This is a thought experiment that requires LLM reasoning to execute meaningfully.

A pure-heuristic wizard (template questions + programmatic scores) would work for obvious cases but miss the subtle anti-patterns that motivated this entire change. The Huma case was caught by human domain expertise, not automated checks — the review wizard should approximate that expertise.

#### Proposed wizard structure

```
value_model_review.agent_prompt.md (FIRE phase)

1. Load Context
   - Read value model files
   - Read product_portfolio.yaml (if exists)
   - Run AssessQuality() via MCP tool

2. Present Quality Report
   - Overall score and level (good/warning/alert)
   - Per-check results with details
   - Specific warnings with affected layers/components

3. Guided Review (LLM-assisted)
   For each quality warning:
   - Explain what the check detected and why it matters
   - Ask the user targeted questions (litmus tests)
   - Propose specific restructuring if needed

4. Domain Validation
   - Walk through each L1 layer:
     "Does this represent a category of value delivery or a product?"
   - Walk through L1→L2 relationships:
     "Could multiple products contribute to this component?"
   - Cross-reference with portfolio:
     "Which products contribute to which layers?"

5. Produce Review Report
   - Summary: score, pass/fail on each litmus test, recommendations
   - Specific restructuring suggestions (if any)
   - Confidence level: "high confidence good structure" / "recommend restructuring"
```

**Registration requirements** (when implemented):
- File: `apps/epf-cli/internal/embedded/wizards/value_model_review.agent_prompt.md`
- Phase: FIRE (add to `PhaseForWizard` map in `internal/wizard/types.go`)
- Keywords: "review value model", "check value model", "value model quality", "anti-pattern" (add to `KeywordMappings` in `recommender.go`)
- Trigger phrases in wizard metadata: "review my value model", "check value model quality"

### Decision 10: JSON Schema Boundary — Semantic Constraints Stay in Programmatic Validation

**Status**: Design exploration (Phase 4) — research complete, confirms the original assumption.

**Finding**: JSON Schema (Draft-07 or 2020-12) cannot express the semantic constraints needed to detect the product-catalog anti-pattern. All four target constraints require programmatic validation.

#### Current state

EPF uses **JSON Schema Draft-07** across all 21 schemas. The value model schema (`v2.5.0`, 346 lines) enforces structural constraints well:

| Capability | Schema Feature | Example |
|---|---|---|
| Enumerated values | `enum` | `track_name` restricted to 4 values |
| String patterns | `pattern` | Layer `id` must match `^[a-z][a-z0-9-]*[a-z0-9]$` |
| Length bounds | `minLength`/`maxLength` | `description` requires 50-1000 chars |
| Array bounds | `minItems`/`maxItems` | 1-12 layers, 0-15 components, 0-100 sub-components |
| Required fields | `required` | Track name, version, status, description |
| Schema composition | `$ref` | Track definition schemas extend a shared base |

Unused Draft-07 features: `if/then/else`, `dependencies` (conditional constraints available but not applied).

#### Constraint-by-constraint analysis

**A. "Layer name must not match any entry in product_portfolio.yaml"**

Impossible in any JSON Schema draft. `$ref` resolves schema fragments, not instance data from other files. No mechanism exists to load external data during validation or compare instance values against values in another document. This is fundamentally a multi-document concern.

EPF already handles similar cross-file validation programmatically: `internal/checks/crossrefs.go` builds a registry of all feature IDs and validates that `requires`/`enables`/`based_on` references resolve. The product-name collision check in `quality.go` follows this same pattern.

**B. "Components should have cardinality > 1 in relationship mapping"**

Impossible. JSON Schema validates a single instance at a time. It cannot count how many features reference a given component across separate feature definition files, nor can it aggregate or group within a single document. The one-to-one mapping detector in `quality.go` requires loading both value models and feature definitions — two independent artifact types.

**C. "Layer names should contain process/action words"**

Severely limited. `pattern` with regex can require that names contain words from a fixed list:
```json
"name": { "pattern": "(?i)(management|transformation|delivery|processing)" }
```
But this approach requires maintaining an exhaustive word list in regex, cannot perform part-of-speech analysis, has no concept of "should" (soft constraint) — `pattern` is pass/fail, and becomes unmaintainable as vocabulary grows. The layer name heuristic in `quality.go` uses a scored approach (positive/negative signals with weights) that JSON Schema cannot express.

**D. "No proper nouns in layer names"**

Impossible. Proper noun detection requires NLP/named entity recognition. "Data & Analytics" (acceptable) and "Google Analytics" (proper noun) are structurally identical title-cased strings. No regex can distinguish them without an exhaustive blacklist. The product-name collision detector in `quality.go` uses the product portfolio as a domain-specific proper noun dictionary — a cross-file data source unavailable to schema validation.

#### 2020-12 upgrade assessment

Moving to 2020-12 would gain:
- `$vocabulary` — declares which vocabularies a schema uses, but validation logic still lives in the validator implementation (Go code), not in the schema
- `$dynamicRef` — runtime schema reference resolution for recursive extension; irrelevant to semantic validation
- `dependentSchemas` — cleaner syntax for "if field X present, require field Y"; already achievable with Draft-07 `dependencies`
- `unevaluatedProperties`/`unevaluatedItems` — stricter composition; useful for schema engineering but irrelevant to semantic constraints

None of these solve the four target constraints. The upgrade improves schema ergonomics but does not shift the boundary.

**Custom vocabularies** (`$vocabulary` + custom keywords): Theoretically, a custom vocabulary could declare keywords like `x-epf-crossFileRef` that trigger Go validation code. The `santhosh-tekuri/jsonschema/v5` library supports custom keyword registration. But this is "programmatic validation with extra steps" — the logic still lives in Go, and the schema keyword is merely a declarative trigger. It adds indirection without expanding what the schema can express.

#### The boundary

| Concern | JSON Schema | Programmatic (Go) |
|---|---|---|
| Type, format, enum, pattern, length, required | **Yes** | Not needed |
| Conditional structure (`if X then Y`) | **Yes** (unused in EPF) | Not needed |
| Cross-file reference resolution | No | **Yes** (`crossrefs.go`) |
| Cross-file name collision | No | **Yes** (`quality.go`) |
| Relationship cardinality | No | **Yes** (`quality.go`) |
| Semantic name scoring | Very limited (fixed regex) | **Yes** (`quality.go`) |
| Proper noun / brand detection | No | **Yes** (`quality.go`) |
| Advisory warnings (not errors) | No (pass/fail only) | **Yes** (WARNING/INFO levels) |

**Conclusion**: The boundary is clear and stable. JSON Schema handles single-document structural validation. Programmatic validation handles everything that requires cross-file data, aggregation, scoring, NLP-like analysis, or advisory (non-blocking) severity levels. The value model quality checks belong entirely in the programmatic layer, and no foreseeable JSON Schema evolution will change this.

**Actionable insight**: The one unexploited capability is `if/then/else` for track-specific structural constraints (e.g., "active tracks require richer descriptions"). This is a separate concern from semantic validation but could be added to the value model schema without a draft upgrade.

## Risks / Trade-offs

| Risk | Impact | Mitigation |
|---|---|---|
| False positives flag legitimate value models | Medium | Advisory warnings only (Decision 6); tune thresholds over time |
| Product portfolio doesn't exist in many instances | Medium | Graceful degradation — skip check, emit info message (Decision 5) |
| Documentation alone doesn't prevent the anti-pattern | Medium | Phase 2 heuristics provide automated detection; documentation is necessary but not sufficient |
| Two value model type systems cause confusion | Low | Decision 2 is explicit: build on `internal/valuemodel/` only; do not touch strategy types |
| Embedded file updates diverge from canonical-epf | Low | Track as separate task; canonical-epf updates follow once epf-cli is validated |
| Quality scoring adds complexity to health check output | Low | Separate section in report; only shown when value models exist |

## Open Questions

None — all phases (1-4) are complete. Phase 4 design explorations are documented in Decisions 9 and 10. Implementation of the value model review wizard (Decision 9) can proceed as a separate change when prioritized.
