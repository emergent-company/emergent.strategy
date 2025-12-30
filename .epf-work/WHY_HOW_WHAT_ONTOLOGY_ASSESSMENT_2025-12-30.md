# WHY-HOW-WHAT Ontology Assessment

**Date:** 2025-12-30  
**Purpose:** Align EPF language with Simon Sinek's WHY-HOW-WHAT framework to reflect how emergence actually works through overlapping, interconnected layers

---

## The Problem: Current Inconsistent Language

We've been saying things like:
- "Value Model = WHY"
- "Feature Definition = WHAT" 
- "Implementation Spec = HOW"

This is **backwards** according to Sinek's framework and doesn't capture how the layers actually overlap and interconnect.

---

## The Correct Ontology (Simon Sinek + Emergence)

**WHY** → Purpose, belief, cause (the reason something exists)  
**HOW** → Process, values, unique approach (the way you deliver the WHY)  
**WHAT** → Products, services, tangible results (the concrete manifestation)

**CRITICAL INSIGHT:** Each layer contains overlapping WHY-HOW-WHAT elements that ensure continuity and deep integration. This is how emergence works - the parts cannot be too loosely coupled.

---

## EPF's 4-Level Hierarchy with WHY-HOW-WHAT Continuity

### Level 1: Value Model (Strategic WHY + Strategic HOW)

**Contains:**
- **WHY** (dominant): Purpose, value drivers, beneficiaries ("why we exist")
- **HOW** (supporting): Capabilities, value flows, logical structure ("how value flows through the system")
- **WHAT** (minimal): High-level components, not specific implementations

**Example - Value Model:**
```yaml
l2_component: "Portfolio Risk Management"
uvp: "Risk metrics are calculated and monitored so that fund managers can avoid
     regulatory violations, which helps us maintain trading licenses."
# ↑ WHY: avoid violations, maintain licenses
# ↑ HOW: through calculation and monitoring
# ↑ WHAT (implied): some system that does this
```

**EPF Responsibility:** ✅ Product team defines this
**Changes:** Annually or less (strategic shifts)

---

### Level 2: Feature Definition (Tactical HOW + Strategic WHAT)

**Contains:**
- **WHY** (inherited from value model): Links back to value drivers via `contributes_to`
- **HOW** (dominant): User scenarios, workflows, interactions ("how users achieve outcomes")
- **WHAT** (emerging): Contexts, jobs-to-be-done, acceptance criteria ("what value is delivered to whom")

**Example - Feature Definition:**
```yaml
scenario:
  name: "Monitor Portfolio Risk in Real-Time"
  # WHY (inherited): Links to "Portfolio Risk Management" value component
  actor: "Sarah Martinez, Risk Officer"
  context: "Sarah reviews portfolio dashboard during trading hours"
  # HOW (dominant): The workflow, the steps, the interaction pattern
  trigger: "Portfolio exposure exceeds regulatory threshold"
  action: "Sarah receives alert, reviews risk breakdown, adjusts positions"
  outcome: "Portfolio brought back within regulatory limits"
  # WHAT (emerging): Real-time monitoring, alerts, risk breakdown, position adjustment
  acceptance_criteria:
    - "Alert delivered within 30 seconds of threshold breach"
    - "Risk breakdown shows contribution by asset class"
    # ↑ WHAT on high level (outcomes, capabilities), NOT implementation
```

**Key Point:** Feature definitions have **WHAT** (contexts, scenarios, jobs-to-be-done) but on a **high, non-implementation level**. They describe what happens, not how it's technically built.

**EPF Responsibility:** ✅ Product team defines this  
**Changes:** Quarterly or less (iteration based on learning)

---

### HANDOFF POINT: Between Levels 2 and 3

This is where **product team hands off to engineering team**. But notice the continuity:

- Level 2 ends with: "Alert delivered within 30 seconds"
- Level 3 begins with: "How do we deliver an alert within 30 seconds?"

The **WHAT** from Level 2 becomes the **WHY** for Level 3's **HOW** decisions.

---

### Level 3: Feature Implementation Spec (Detailed HOW + Technical WHAT)

**Contains:**
- **WHY** (inherited from feature definition): The acceptance criteria become requirements
- **HOW** (dominant): Architecture, APIs, algorithms, data flows ("how we technically build this")
- **WHAT** (specific): Specific technologies, endpoints, schemas ("what specific tools we use")

**Example - Implementation Spec:**
```markdown
# Risk Alert System Implementation Spec

## WHY (inherited from Feature Definition)
- Must deliver alerts within 30 seconds of threshold breach
- Must show risk breakdown by asset class
- (These are the acceptance criteria from Level 2)

## HOW (dominant): Technical approach
- WebSocket connection for real-time updates
- Event-driven architecture with Kafka
- Risk calculation service polls portfolio every 10 seconds
- Alert service subscribes to risk events
- Frontend receives WebSocket push when threshold exceeded

## WHAT (specific): Technologies and components
- Backend: Node.js + Kafka + Redis
- API: WebSocket /ws/risk-alerts, REST /api/portfolio/risk
- Database: PostgreSQL with TimescaleDB extension
- Frontend: React + WebSocket client library
- Monitoring: Datadog for alert latency tracking
```

**EPF Responsibility:** ❌ Engineering team creates this  
**Changes:** Monthly (technical evolution, architecture changes)

---

### Level 4: Implemented Feature/Code (Implemented WHAT)

**Contains:**
- **WHY** (inherited): The implementation spec's requirements
- **HOW** (in code): Actual algorithms, functions, classes
- **WHAT** (concrete): Running software, deployed services, actual code files

**Example - Code:**
```typescript
// risk-alert.service.ts
class RiskAlertService {
  async checkPortfolioRisk(portfolioId: string) {
    const positions = await this.getPositions(portfolioId);
    const risk = this.calculateRisk(positions);
    
    if (risk.exposure > REGULATORY_THRESHOLD) {
      await this.sendAlert(portfolioId, risk);
    }
  }
}
```

**EPF Responsibility:** ❌ Engineering team creates this  
**Changes:** Daily/weekly (continuous deployment)

---

## The Emergence Pattern: Overlapping Continuity

This is the **critical insight** about how EPF works:

```
Level 1: Value Model
├─ WHY: ████████████ (dominant - 70%)
├─ HOW: ████████ (supporting - 25%)
└─ WHAT: ██ (minimal - 5%)
      ↓
      ↓ WHY is inherited ↓
      ↓
Level 2: Feature Definition
├─ WHY: ████ (inherited - 20%)
├─ HOW: ████████████ (dominant - 60%)
└─ WHAT: ████████ (emerging - 20%)
      ↓
      ↓ WHAT becomes WHY ↓
      ↓
Level 3: Implementation Spec
├─ WHY: ████ (inherited - 20%)
├─ HOW: ████████████ (dominant - 60%)
└─ WHAT: ████████ (specific - 20%)
      ↓
      ↓ Implementation continues ↓
      ↓
Level 4: Code
├─ WHY: ██ (inherited - 10%)
├─ HOW: ████████ (in code - 40%)
└─ WHAT: ████████████ (concrete - 50%)
```

**Key Principles:**

1. **Overlapping, Not Discrete:** Each level contains elements of WHY, HOW, and WHAT. They're not cleanly separated.

2. **Inheritance Pattern:** The WHAT from one level becomes context for the next level's HOW decisions.

3. **Increasing Specificity:** Same concepts flow through all levels, getting more specific:
   - Level 1: "Risk monitoring" (abstract capability)
   - Level 2: "Real-time alert within 30 seconds" (outcome-oriented)
   - Level 3: "WebSocket + Kafka architecture" (technical approach)
   - Level 4: `RiskAlertService.checkPortfolioRisk()` (concrete code)

4. **Tightly Coupled for Coherence:** The parts cannot be too loosely coupled or emergence fails. Each level must:
   - Inherit context from above
   - Add specificity appropriate to its level
   - Provide foundation for the level below

5. **EPF Covers WHY + HOW, Not WHAT (Implementation):**
   - EPF = Strategic WHY + Strategic/Tactical HOW (Levels 1-2)
   - Engineering = Technical HOW + Technical WHAT (Levels 3-4)

---

## Corrected Language Patterns

### ❌ WRONG Patterns (What We're Currently Saying)

"Value Model defines **WHY**"  
→ Incomplete - it also defines strategic HOW (value flows, capabilities)

"Feature Definition defines **WHAT**"  
→ Misleading - it defines tactical HOW (scenarios, workflows) and strategic WHAT (outcomes, not implementations)

"Implementation Spec defines **HOW**"  
→ Incomplete - it defines technical HOW + technical WHAT

### ✅ CORRECT Patterns (What We Should Say)

**Value Model:**
- "Defines **WHY we exist** (purpose, value drivers) and **HOW value flows** (capabilities, logical structure)"
- "Answers: Why do we exist? How does value flow through our system?"

**Feature Definition:**
- "Inherits **WHY from value model**, defines **HOW users achieve outcomes** (scenarios, workflows), and specifies **WHAT value is delivered** (contexts, jobs-to-be-done, acceptance criteria) on a high, non-implementation level"
- "Answers: How do users achieve outcomes? What value do they experience?"

**Implementation Spec:**
- "Inherits **WHAT from feature definition** (as requirements), defines **HOW to technically build it** (architecture, APIs, algorithms), and specifies **WHAT technologies to use**"
- "Answers: How do we technically build this? What specific technologies do we use?"

**Code:**
- "Implements **WHAT was specified** in technical terms, as running software"
- "Answers: What is the actual executable system?"

---

## Specific Language Changes Needed

### In Value Model Documentation

❌ WRONG: "Value models define WHY things are valuable"  
✅ CORRECT: "Value models define WHY we exist (purpose, value drivers) and HOW value flows through capabilities and logical structure"

❌ WRONG: "This is the WHY layer"  
✅ CORRECT: "This is the strategic WHY + HOW layer - it defines both purpose and the high-level approach to delivering value"

### In Feature Definition Documentation

❌ WRONG: "Feature definitions define WHAT will be built"  
✅ CORRECT: "Feature definitions inherit WHY from value model, define HOW users achieve outcomes through scenarios and workflows, and specify WHAT value is delivered (contexts, jobs-to-be-done, acceptance criteria) on a high, non-implementation level"

❌ WRONG: "This answers WHAT (the implementation perspective)"  
✅ CORRECT: "This answers HOW users interact with the system and WHAT value they experience - not HOW it's technically built"

❌ WRONG: "Feature definitions don't include implementation details"  
✅ CORRECT: "Feature definitions include strategic WHAT (what value, what outcomes, what user experiences) but NOT technical WHAT (what APIs, what database tables, what code architecture)"

### In Implementation Spec Documentation

❌ WRONG: "Engineering defines HOW to build it"  
✅ CORRECT: "Engineering defines HOW to technically build it (architecture, APIs, algorithms) and WHAT specific technologies to use"

❌ WRONG: "This is outside EPF scope"  
✅ CORRECT: "This is outside EPF scope - EPF covers strategic WHY + HOW (Levels 1-2), engineering covers technical HOW + WHAT (Levels 3-4)"

### In Handoff Point Documentation

❌ WRONG: "Product team defines WHAT, engineering defines HOW"  
✅ CORRECT: "Product team defines WHY (purpose) + HOW (user workflows) + strategic WHAT (outcomes). Engineering defines technical HOW (architecture) + technical WHAT (technologies, code)."

❌ WRONG: "EPF defines the WHAT, engineering implements it"  
✅ CORRECT: "EPF defines WHY and HOW on the strategic/user level. The WHAT in feature definitions (contexts, scenarios, outcomes) becomes the starting point for engineering's technical HOW decisions."

---

## The "Well-Functioning Organism" Principle

Your point about tight coupling is profound and central to EPF:

> "In a well functioning organism the parts cannot be too loosely coupled."

**What this means:**

1. **Continuity Through Layers:** Each level must overlap with and inherit from the level above. No gaps.

2. **Emergence Requires Integration:** The complete solution emerges as a result of all its pieces being overlapping and interconnected.

3. **Traceability is Bi-Directional:**
   - Forward: "This capability in value model → enables these scenarios in features → requires this architecture in impl → uses this code"
   - Backward: "This code → implements this architecture → fulfills these scenarios → delivers this value"

4. **Consistency Checks Across Layers:**
   - Value model says "30-second risk alerts" is strategically valuable
   - Feature definition says "alert within 30 seconds" is acceptance criteria
   - Implementation spec says "WebSocket + Kafka for real-time delivery"
   - Code has latency monitoring ensuring 30-second SLA

5. **EPF Provides the Connective Tissue:** Value models and feature definitions are the "connective tissue" that ensures:
   - Strategy connects to user experience
   - User experience connects to technical implementation
   - Everything traces back to WHY

Without this tight coupling, you get:
- Features that don't support strategy
- Implementations that don't fulfill user needs
- Code that doesn't align with purpose

---

## Action Items: Systematic Language Correction

### Phase 1: Core Documentation Files (11 files already modified)
- [ ] README.md - Update WHY/HOW/WHAT language
- [ ] docs/EPF_WHITE_PAPER.md - Update hierarchy explanations
- [ ] integration_specification.yaml - Clarify WHY/HOW/WHAT per level
- [ ] MAINTENANCE.md - Update AI agent guidance
- [ ] docs/guides/VALUE_MODEL_BUSINESS_LANGUAGE_GUIDE.md - Add WHY/HOW/WHAT section
- [ ] docs/guides/FEATURE_DEFINITION_IMPLEMENTATION_GUIDE.md - Clarify strategic WHAT vs technical WHAT
- [ ] wizards/product_architect.agent_prompt.md - Update language
- [ ] wizards/feature_definition.wizard.md - Add WHY/HOW/WHAT guidance
- [ ] wizards/lean_start.agent_prompt.md - Simplify for startup audience
- [ ] wizards/README.md - Update scope description
- [ ] .epf-work/MULTI_PRODUCT_LINE_ARCHITECTURE_ANALYSIS_2025-12-30.md - Update analysis

### Phase 2: Supporting Documentation
- [ ] docs/guides/PRODUCT_PORTFOLIO_GUIDE.md
- [ ] templates/FIRE/value_models/*.yaml (comment headers)
- [ ] templates/FIRE/feature_definitions/*.yaml (comment headers)
- [ ] All wizard files (search for WHY/HOW/WHAT usage)

### Phase 3: Validation
- [ ] Search for all instances of "WHY", "HOW", "WHAT" in caps
- [ ] Review each usage against corrected ontology
- [ ] Update or add clarifying context where needed

---

## Recommended Commit Message

```
Align EPF language with Simon Sinek WHY-HOW-WHAT ontology + emergence principles

CRITICAL CLARIFICATION: EPF's 4 levels have overlapping WHY-HOW-WHAT elements
that ensure continuity and deep integration (emergence principle).

Corrected ontology:
- Level 1 (Value Model): Strategic WHY + Strategic HOW
- Level 2 (Feature Definition): Inherited WHY + Tactical HOW + Strategic WHAT
- Level 3 (Implementation Spec): Technical HOW + Technical WHAT  
- Level 4 (Code): Implemented WHAT

Key insight: Each level inherits from above and provides foundation for below.
The WHAT from one level becomes context for the next level's HOW decisions.
This tight coupling is essential for emergence - parts cannot be too loosely coupled.

EPF scope: WHY + HOW (strategic/tactical), NOT technical WHAT (implementation).

Files updated: [list]
```

---

## Next Steps

1. Review this assessment with team
2. Agree on corrected language patterns
3. Systematically update all 11+ files
4. Add "WHY-HOW-WHAT Ontology" section to white paper or guides
5. Update all wizard prompts with corrected guidance
6. Create validation checklist for future documentation
