---
applyTo: "**"
---

# Self-Learning Log

This file documents lessons learned during AI-assisted development sessions. Each entry captures a mistake, why it happened, and how to prevent it in the future.

---

### 2025-12-27 - Generated Feature Definition from Memory Instead of Schema

**Context**: Creating first business feature (fd-007-organization-workspace-management.yaml) for EPF Feature Corpus after successfully validating 6 technical features (fd-001 through fd-006).

**Mistake**: Generated fd-007 using outdated patterns from training data memory instead of reading the authoritative feature_definition_schema.json (v2.0.0) first. This resulted in:
- 0 personas (schema requires exactly 4)
- Scenarios using v1.x structure (description, actors, preconditions, flow, postconditions) instead of v2.0 structure (actor, context, trigger, action, outcome, acceptance_criteria)
- Contexts missing required arrays (key_interactions, data_displayed)

**Why It Was Wrong**:
1. **Schema is THE source of truth** - not AI training data, not memory of patterns
2. **Validation script was available** - could have read it first to see exact requirements
3. **Working examples existed** - fd-002 had already passed validation and could serve as template
4. **User requested validation-first approach** - should have been extra careful to get it right the first time
5. **All necessary information was accessible** - schema file, validation script, validated examples - no excuse for generating from memory

**Root Cause**: 
- Training data likely contains v1.x feature definition patterns (older format)
- Generated from memorized patterns instead of reading current schema specification
- Didn't treat schema as authoritative source requiring explicit reading before generation
- Assumed "I know what this looks like" instead of verifying against current requirements

**Correct Approach - Schema-First Generation Process**:

1. **Read Schema Sections FIRST** (before generating anything):
   ```bash
   read_file: feature_definition_schema.json (personas section ~300-400)
   read_file: feature_definition_schema.json (scenarios section ~500-600)
   read_file: feature_definition_schema.json (contexts section ~200-300)
   ```

2. **Read Validation Script** to understand what gets checked:
   ```bash
   read_file: scripts/validate-feature-quality.sh (lines 1-100)
   ```

3. **Read Validated Examples** as structural templates:
   ```bash
   read_file: fd-002-knowledge-graph-engine.yaml (personas section)
   read_file: fd-002-knowledge-graph-engine.yaml (scenarios section)
   read_file: fd-002-knowledge-graph-engine.yaml (contexts section)
   ```

4. **Generate with Schema Open** - cross-reference every section against schema requirements while writing

5. **Validate Immediately** after creation - catch errors before continuing

6. **Fix if Needed** using schema + examples as reference

7. **Never Generate from Memory** for structured formats with explicit schemas

**Schema v2.0 Key Requirements** (must memorize for future reference):
- **Personas**: Exactly 4 (minItems: 4, maxItems: 4, no flexibility)
- **Persona Narratives**: current_situation ≥200 chars, transformation_moment ≥200 chars, emotional_resolution ≥200 chars
- **Scenarios**: 8 required fields (id, name, actor, context, trigger, action, outcome, acceptance_criteria)
- **Scenario Placement**: Top-level structure (not nested under definition)
- **Contexts**: Required arrays - key_interactions (min 1 item), data_displayed (min 1 item)

**Prevention Checklist** (use for EVERY feature creation):
- [ ] Read schema section for component type before generating
- [ ] Read validation script to understand checks
- [ ] Read validated example showing correct structure
- [ ] Generate using schema + example as template (NOT from memory)
- [ ] Cross-reference each section against schema while writing
- [ ] Validate immediately after creation
- [ ] If validation fails, read error messages carefully and fix systematically

**Time Cost**:
- Wrong approach (generate from memory → validate → read schema → fix → re-validate): ~45 minutes
- Correct approach (read schema → read example → generate correctly): ~20 minutes
- **Wasted time**: ~25 minutes per feature (multiplied across 15-20 features = 6-8 hours wasted)

**Impact**:
- User frustration: "How is it possible that you got it wrong in the first instance?"
- Loss of trust in AI accuracy when explicit specifications exist
- Preventable rework cycle (create → fail → fix → validate → pass)
- User had to intervene and request validation before proceeding

**Key Takeaway**: **ALWAYS READ THE SCHEMA FIRST.** Structured formats with explicit schemas (JSON Schema, OpenAPI, YAML specifications, database schemas) are authoritative sources that must be read and used as templates. Training data is outdated. Memory is unreliable. Schema is truth. This applies to:
- Feature definitions (feature_definition_schema.json)
- API specifications (OpenAPI/Swagger schemas)
- Database schemas (TypeORM entities, SQL CREATE TABLE statements)
- Configuration files (JSON Schema, YAML validation)
- Protocol definitions (GraphQL schemas, Protobuf definitions)

**Strategic Learning**: When working with ANY structured format:
1. **Locate the schema/specification file** (*.schema.json, openapi.yaml, *.proto, etc.)
2. **Read relevant sections** before generating content
3. **Use validated examples** as templates (test files, reference implementations)
4. **Validate immediately** after generation
5. **Never rely on training data memory** for current specifications

**Related Files/Conventions**:
- `/Users/nikolai/Code/epf/schemas/feature_definition_schema.json` (authoritative source, v2.0.0)
- `/Users/nikolai/Code/epf/scripts/validate-feature-quality.sh` (validation enforcement)
- `/Users/nikolai/Code/epf/features/01-technical/fd-002-knowledge-graph-engine.yaml` (validated technical example)
- `/Users/nikolai/Code/epf/features/02-business/fd-007-organization-workspace-management.yaml` (validated business example, after fixes)
- This applies to ANY schema-driven format in ANY repository

---

### 2025-12-29 - Created Working File in Wrong Directory (docs/ vs .epf-work/)

**Context**: During white paper development session, created analysis file `EPF_WHITE_PAPER_COVERAGE_ANALYSIS.md` to compare white paper coverage against live website and emergent repo documentation.

**Mistake**: Placed the file in `docs/EPF_WHITE_PAPER_COVERAGE_ANALYSIS.md` instead of `.epf-work/EPF_WHITE_PAPER_COVERAGE_ANALYSIS.md`. This violated canonical EPF purity rules by putting temporary working documentation in the permanent framework documentation directory.

**Why It Was Wrong**:
1. **`docs/` is for permanent framework documentation** - guides, technical references, architecture decisions that are part of the framework itself
2. **`.epf-work/` exists specifically for temporary analysis** - working documents, AI reasoning logs, session-specific insights
3. **File was session-specific analysis** - comparing white paper to other sources, not explaining the framework
4. **Canonical purity violation** - temporary work artifacts pollute the permanent documentation structure
5. **User had to intervene** - spotted the misplaced file and asked about it

**Root Cause**:
- Didn't consult `.epf-work/README.md` before deciding where to place analysis file
- Assumed `docs/` was general-purpose documentation directory
- Didn't apply CANONICAL_PURITY_RULES.md Pre-Flight Checklist before file creation
- Created file based on convenience ("it's a markdown doc, goes in docs/") instead of purpose-based structure

**Correct Approach - Purpose-Based File Placement**:

1. **Before creating ANY file in EPF repo**, ask:
   - Is this **permanent framework documentation**? → `docs/`, `docs/guides/`, or root-level
   - Is this **temporary analysis or working doc**? → `.epf-work/`
   - Is this **product-specific**? → Product repo, not canonical EPF

2. **Read `.epf-work/README.md`** to understand what belongs there:
   ```bash
   read_file: .epf-work/README.md (lines 1-50)
   ```

3. **Apply directory purpose rules**:
   - `docs/` = Permanent guides explaining framework concepts to users
   - `.epf-work/` = Temporary analysis, AI reasoning, session work
   - `features/` = Validated feature definition examples (corpus)
   - `schemas/` = JSON Schema definitions
   - `templates/` = YAML templates for instances
   - `wizards/` = AI-assisted creation guides

4. **Check existing files in target directory** to validate pattern:
   ```bash
   list_dir: docs/ (see what's there)
   list_dir: .epf-work/ (see similar files)
   ```

5. **Use descriptive filenames** that indicate purpose and date:
   - `.epf-work/WHITE_PAPER_COVERAGE_ANALYSIS_2025-12-29.md` ✅
   - `docs/EPF_WHITE_PAPER_COVERAGE_ANALYSIS.md` ❌

**Directory Purpose Reference** (memorize for EPF work):

| Directory | Purpose | Examples |
|-----------|---------|----------|
| `docs/` | Permanent framework documentation | `EPF_WHITE_PAPER.md`, guides explaining concepts |
| `.epf-work/` | Temporary analysis, AI reasoning logs | `ANALYSIS_*.md`, `COMPONENT_*_COMPLETE.md` |
| `docs/guides/` | How-to guides for users | `ADOPTION_GUIDE.md`, `GETTING_STARTED.md` |
| `docs/guides/technical/` | Advanced framework internals | Schema design, validation architecture |
| `features/` | Validated feature examples (corpus) | `fd-001-*.yaml`, `fd-002-*.yaml` |
| `schemas/` | JSON Schema definitions | `feature_definition_schema.json` |
| `templates/` | YAML templates for instances | `00_north_star_principle.yaml` |
| `wizards/` | AI-assisted creation guides | `lean_start.agent_prompt.md` |
| `_instances/` | Instance structure documentation | `README.md` only (no actual instances) |
| `.github/instructions/` | AI agent instructions | `self-learning.instructions.md` |

**Prevention Checklist** (use for EVERY file creation in EPF):
- [ ] Identify file purpose: permanent documentation, temporary analysis, or product-specific?
- [ ] Consult relevant README (`.epf-work/README.md`, `docs/guides/README.md`, etc.)
- [ ] Check existing files in target directory to validate pattern
- [ ] Apply CANONICAL_PURITY_RULES.md Pre-Flight Checklist (Question 3)
- [ ] Use descriptive filename indicating purpose and date if temporary
- [ ] If unsure, default to `.epf-work/` for working files (can always promote later)

**Time Cost**:
- Wrong approach (create in docs/ → user spots error → remove → explain): ~15 minutes
- Correct approach (check README → place in .epf-work/): ~2 minutes
- **Wasted time**: ~13 minutes, plus user interruption and trust impact

**Impact**:
- User had to spot and correct the mistake
- Canonical EPF repo temporarily polluted with working file
- Committed the file before realizing error (had to create removal commit)
- Demonstrates lack of understanding of repository structure and purpose

**Key Takeaway**: **DIRECTORY STRUCTURE HAS PURPOSE, NOT JUST CONVENTION.** Before creating any file, understand the repository's organizational philosophy and consult the relevant README. Working files belong in `.epf-work/`, not `docs/`. When in doubt, ask or default to the working directory - it's easier to promote a working file to permanent documentation than to clean up misplaced files.

**Related Files/Conventions**:
- `/Users/nikolai/Code/epf/.epf-work/README.md` (explains what belongs in working directory)
- `/Users/nikolai/Code/epf/CANONICAL_PURITY_RULES.md` (Pre-Flight Checklist, Question 3)
- `/Users/nikolai/Code/epf/docs/guides/README.md` (explains docs/guides/ structure)
- This applies to ANY repository with explicit directory structure and purpose documentation

---

## Instructions for Future Sessions

When you encounter this file:

1. **Read it completely** before starting work on related areas
2. **Check for relevant lessons** related to your current task
3. **Add new lessons** when mistakes happen
4. **Update existing lessons** if you discover additional context

This is a living document. Every mistake is an opportunity to improve.
