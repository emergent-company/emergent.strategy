# Development Handover Brief Generator

**Purpose:** Generate engineering handover briefs from EPF artifacts to facilitate implementation proposals from development teams.

**Version:** 1.0.0

---

## Overview

The Development Handover Brief Generator creates structured documentation that bridges EPF strategic artifacts (feature definitions, value models, roadmaps) with engineering implementation. The brief provides:

1. **Feature Context** - What to build and why (from feature definitions)
2. **Value Mapping** - Which value model components receive value
3. **Calibration** - Implementation scope, quality expectations, constraints
4. **Tech Stack Impact** - Services, integrations, and data stores affected
5. **Questions & Success Criteria** - Open items for engineering review
6. **GitHub Permalinks** - Shareable links to EPF artifacts (works outside VS Code)

---

## Quick Start

Ask your AI assistant:

```
"Generate a development handover brief for [features] from [product-name]"
```

Example:
```
"Generate a development handover brief for fd-017 and fd-018 from emergent"
```

The wizard will guide you through:
1. Brief identity (title, summary)
2. **GitHub repository configuration** (owner, repo, branch)
3. Feature selection and prioritization
4. Value model component mapping
5. Implementation calibration (scope, quality, constraints)
6. Document generation and validation

---

## Files

| File | Purpose |
|------|---------|
| `wizard.instructions.md` | Generation logic and interactive phases |
| `schema.json` | Input validation and structure definition |
| `validator.sh` | Output validation script |
| `README.md` | This quick reference guide |

---

## GitHub Permalinks

All EPF artifact links in the generated brief are **GitHub permalinks**, making the document portable:

- ✅ Share via Slack, email, Notion, Confluence
- ✅ Links work outside VS Code / local checkout
- ✅ Engineering can access EPF context without local setup
- ✅ Links are stable (branch or commit-based)

### Configuration

During generation, you'll provide:

```yaml
github_config:
  owner: "eyedea-io"        # GitHub org/user
  repo: "lawmatics"         # Repository name
  branch: "dev"             # Default branch for stable links
  commit_sha: null          # Optional: immutable link to specific commit
```

### Example Permalink

```markdown
[fd-017: Password Recovery](https://github.com/eyedea-io/lawmatics/blob/dev/docs/EPF/_instances/emergent/FIRE/feature_definitions/fd-017-password-recovery.yaml)
```

**Tip:** Use branch-based links (not commit SHA) for living documents that should reference the latest version.

---

## When to Use

Generate a development handover brief when:

- ✅ Product management needs to hand off features to engineering
- ✅ Starting a new implementation cycle with defined scope
- ✅ Engineering needs context for creating implementation proposals
- ✅ Cross-team handoffs require documented scope and expectations
- ✅ Calibrating MVP vs full implementation scope

**Do NOT use for:**
- ❌ Detailed technical specifications (engineering creates these)
- ❌ Sprint planning or task breakdown
- ❌ Architecture decision records
- ❌ API documentation

---

## Key Concepts

### Calibration Input

The calibration section captures implementation ambition:

| Dimension | Options | Meaning |
|-----------|---------|---------|
| **Scope Level** | MVP, Functional, Polished, Enterprise | How complete should the implementation be? |
| **Timeline Pressure** | Relaxed, Normal, Aggressive, Critical | What trade-offs are acceptable? |
| **Test Coverage** | Minimal, Standard, Comprehensive | Testing expectations |
| **Documentation** | Minimal, Standard, Comprehensive | Documentation requirements |
| **Performance** | Acceptable, Optimized, Enterprise-grade | Performance requirements |
| **Security** | Basic, Standard, Hardened | Security posture |

### Feature Priority

Each feature can be tagged with priority:

- **must-have** - Core scope, cannot ship without
- **should-have** - Important but could be descoped if needed
- **nice-to-have** - Include if time permits

### Existing Implementation & Delta

When features have prior implementation, the brief captures:

```yaml
existing_implementation:
  has_existing: true
  maturity_level: "mvp"  # prototype | mvp | production | mature
  current_state: "Basic password reset via email. No identity verification."
  code_references:
    - location: "libs/lib-api/src/auth/"
      description: "Current auth module"
      relevance: "extend"  # extend | modify | replace | reference
  limitations:
    - "No identity verification"
    - "Only email-based recovery"
  technical_debt:
    - "Auth module needs refactoring"

implementation_delta:
  delta_summary: "Adding BankID identity verification as alternative recovery path"
  capability_changes:
    - capability_id: "cap-001"
      change_type: "new"      # new | enhanced | refactored | unchanged
      description: "Building from scratch"
    - capability_id: "cap-003"
      change_type: "enhanced"
      description: "Extending to support identity-based flow"
  breaking_changes:
    - change: "Password reset API signature"
      impact: "All clients using reset API"
      migration_path: "Version API endpoint, deprecate old after 2 releases"
  migrations_required:
    - type: "database"
      description: "Add identity_links table"
      complexity: "trivial"
      reversible: true
  backwards_compatibility:
    required: true
    duration: "2 releases"
    approach: "Version API endpoints"
```

### Deferred Scope

Explicitly document what is NOT included to prevent scope creep:

```yaml
deferred_scope:
  - item: "Enterprise group policy inheritance"
    rationale: "Requires multi-org architecture not yet in place"
    future_consideration: "Include in Phase 2 after org hierarchy ships"
```

---

## Output Structure

Generated briefs follow this structure:

```
# {Brief Title}

## Overview
Executive summary and scope table

## Features Included
Feature definitions with capabilities, contexts, and EPF links

## Value Model Mapping
Which components receive value from this implementation

## Existing Implementation & Delta  ← NEW
Current state, code references, capability changes, migrations

## Tech Stack Impact
Services, integrations, and data changes

## Implementation Considerations
Key patterns and recommendations

## Calibration & Constraints
Quality expectations, constraints, deferred scope

## Related Key Results
Roadmap KRs this advances

## Questions for Engineering Review
Open items needing engineering input

## Success Criteria
Measurable outcomes

## EPF Artifact Links
Direct links to all referenced EPF documents

## Next Steps
Handoff workflow guidance
```

---

## Validation

Run the validator to check your brief:

```bash
bash docs/EPF/outputs/development-brief/validator.sh path/to/brief.md
```

The validator checks:
- Required sections present
- Metadata complete
- Feature definitions linked
- Value model mapping present
- Calibration specified
- EPF artifact links valid
- No placeholders remaining

---

## Output Location

> ⚠️ **CRITICAL:** Save briefs to the correct location!

Save generated briefs to:
```
docs/EPF/_instances/{product}/outputs/development-briefs/{brief-slug}-{date}.md
```

**Example:**
```
docs/EPF/_instances/lawmatics/outputs/development-briefs/kyc-aml-deployment-ready-2026-01-26.md
```

**❌ Common mistakes:**
- `cycles/` folder is for archived planning cycles, NOT outputs
- `docs/EPF/outputs/` is for generator definitions, NOT generated artifacts
- Always create the `outputs/development-briefs/` folder if it doesn't exist

---

## Example Usage

### Input Example (Manual Brief from user request)

```markdown
Digital Identity Security Features - Engineering Brief

Overview:
We're adding enterprise-grade security features using Digital Identity (BankID via Signicat) for:
- Account Recovery - Recover compromised accounts without email/phone
- Step-Up Verification - Require BankID for high-impact actions

These are premium features for enterprise customers.
```

### Generated Brief (from EPF)

The generator transforms this into a structured brief with:
- Links to `fd-017` and `fd-018` feature definitions
- Value model mapping to Security and Compliance components
- Calibration for "Functional" scope, "Normal" timeline
- Tech stack impact (api-id, Auth0, Signicat, PostgreSQL)
- Engineering questions about integration patterns
- Success criteria from feature metrics

---

## Relationship to Other Artifacts

```
EPF Artifacts (Input)              Development Brief (Output)           Engineering (Downstream)
┌─────────────────────┐           ┌─────────────────────────┐          ┌─────────────────────┐
│ Feature Definitions │──────────▶│                         │          │                     │
│ (fd-XXX.yaml)       │           │  Development            │          │ Implementation      │
├─────────────────────┤           │  Handover Brief         │─────────▶│ Proposal            │
│ Value Models        │──────────▶│                         │          │                     │
│ (*.value_model.yaml)│           │  • Features + Context   │          │ (Architecture,      │
├─────────────────────┤           │  • Value Mapping        │          │  Estimates,         │
│ Roadmap Recipe      │──────────▶│  • Calibration          │          │  Tech Design)       │
│ (05_roadmap.yaml)   │           │  • Questions            │          │                     │
└─────────────────────┘           └─────────────────────────┘          └─────────────────────┘
```

---

## Tips

1. **Be specific with calibration** - Engineering will use this to scope their proposal
2. **List constraints explicitly** - Technical debt, dependencies, compliance requirements
3. **Document deferred scope** - Prevents scope creep and sets expectations
4. **Include engineering questions** - Surfaces decisions needed before implementation
5. **Link EPF artifacts** - Engineering should be able to dig deeper when needed

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-26 | Initial release |
