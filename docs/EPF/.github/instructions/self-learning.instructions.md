---
applyTo: "**"
---

# Self-Learning Log (Historical Lessons)

## ⚠️ BEFORE Reading This File ⚠️

**This file contains historical lessons learned. For current guidelines:**

**→ Read `docs/EPF/.ai-agent-instructions.md` FIRST**

That file contains:
- Schema-first enrichment workflow (mandatory for any EPF work)
- Current validation and consistency protocols
- Version management procedures

This file documents past mistakes to provide context, but `.ai-agent-instructions.md` is the authoritative source.

---

## 🔔 Quick Reminder

**Before committing framework changes:**
```bash
./scripts/classify-changes.sh  # Checks if version bump needed
```

**After version bumps - UPDATE MIGRATION INFRASTRUCTURE:**
```bash
# bump-framework-version.sh now AUTOMATICALLY updates:
#   - migrations/registry.yaml (epf_current_version, last_updated)
# 
# YOU MUST STILL MANUALLY:
# 1. Add version entry to migrations/registry.yaml versions[] array (if changes to schemas/templates)
# 2. Create migration guide if breaking changes: migrations/guides/vX.x-to-vY.x.md
# 3. Test: ./scripts/generate-migration-plan.sh _instances/{any-product}
```

---

## Historical Mistakes (Permanent Archive)

### 2025-12-30 - Work Files Belong in .epf-work/, Not Production Directories

**Context**: After migrating EPF output validators from TypeScript to shell scripts, created several analysis and implementation documents in `docs/EPF/outputs/` directory.

**Mistake**: Created temporary work/analysis documents directly in production directory:
- `docs/EPF/outputs/VALIDATOR_ARCHITECTURE_DECISION.md`
- `docs/EPF/outputs/IMPLEMENTATION_SUMMARY.md`
- `docs/EPF/outputs/INVESTOR_MEMO_IMPLEMENTATION.md`
- `docs/EPF/outputs/validation/*.archived` files

User had to remind me MULTIPLE TIMES that these belong in `.epf-work/` directory.

**Why It Was Wrong**:
- Production directories should only contain files that are part of the actual system
- Work documents, analysis, implementation notes, and archived files clutter production structure
- Makes it unclear what's "real" vs "temporary" for other developers
- This is not the first time - the pattern has been established and corrected multiple times

**Correct Approach**:
1. **ALWAYS put work/analysis documents in `.epf-work/`** with appropriate subdirectory:
   ```bash
   .epf-work/validator-migration/      # For this session's work
   .epf-work/feature-analysis/
   .epf-work/debugging-sessions/
   ```

2. **Production directories contain ONLY**:
   - Schemas (JSON Schema files)
   - Wizards (generator instructions)
   - Templates (output templates)
   - Validation scripts (executable validators)
   - README.md (user documentation)

3. **Work documents include** (ALL go to .epf-work/):
   - Architecture decision records (DECISION in name)
   - Implementation summaries (IMPLEMENTATION/SUMMARY in name)
   - Analysis documents (ANALYSIS in name)
   - Session notes
   - Archived/old versions (.archived extension)

**Prevention - MANDATORY PRE-CHECK**:
- **BEFORE creating ANY .md document**, STOP and ask:
  - Q: "Is this explaining how to USE the production system?"
    - YES → Can go in production directory (like README.md)
    - NO → Must go in .epf-work/
  - Q: "Does the filename contain DECISION, IMPLEMENTATION, ANALYSIS, SUMMARY, ARCHIVED?"
    - YES → Must go in .epf-work/
  - Q: "Is this documenting the development process vs. the end product?"
    - Development process → .epf-work/
    - End product → Production directory

**Related Files/Conventions**:
- `.epf-work/` - Root directory for ALL temporary/work files
- `docs/EPF/outputs/` - Production output system files ONLY
- Pattern applies to ALL workspace areas, not just EPF

**Key Takeaway**: `.epf-work/` exists specifically for this purpose. Work documents pollute production directories and confuse structure. This is an established project convention that MUST be followed EVERY TIME.

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
- `/Users/nikolai/Code/epf/definitions/product/01-technical/fd-002-knowledge-graph-engine.yaml` (validated technical example)
- `/Users/nikolai/Code/epf/definitions/product/02-business/fd-007-organization-workspace-management.yaml` (validated business example, after fixes)
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

### 2025-12-30 - Failed to Bump Version After Significant Documentation Changes

**Context**: After completing comprehensive WHY-HOW-WHAT ontology alignment across 11 EPF documentation files (README, MAINTENANCE, white paper, guides, wizards), committed changes without bumping framework version. User had to notice and ask "Why are we not updating the EPF versioning?"

**Mistake**: Treated significant documentation clarification as "just docs updates" rather than recognizing it as a framework change worthy of version bump. Committed documentation changes (commit 2304023) without updating VERSION, README header, MAINTENANCE current version, or integration_specification version fields.

**Why It Was Wrong**:
1. **EPF has explicit version management protocol** - documented in MAINTENANCE.md
2. **Automated tooling exists** - `./scripts/bump-framework-version.sh` for this exact purpose
3. **Git hook enforces consistency** - pre-commit check validates all 4 version markers match
4. **Documentation changes affect framework usage** - ontology clarification changes how users understand EPF
5. **User had to catch the mistake** - demonstrates lack of process discipline

**Root Cause**:
- Didn't consult MAINTENANCE.md version management section before committing
- Failed to recognize documentation clarification as PATCH-worthy change
- Assumed version bumps only needed for schema/structural changes
- Didn't treat version management as mandatory step in change workflow
- No mental checklist for "what happens after making framework changes"

**Correct Approach - Version Management Discipline**:

1. **Before Committing Framework Changes**, ask:
   - Does this change affect how users understand or apply EPF? (YES → version bump)
   - Does this change schemas, add features, fix bugs, or clarify docs? (YES → version bump)
   - Is this MAJOR (breaking), MINOR (features), or PATCH (docs/fixes)?

2. **Consult Version Management Rules** (MAINTENANCE.md):
   ```bash
   read_file: MAINTENANCE.md (version management section ~660-690)
   ```

3. **Determine Version Bump Type**:
   - MAJOR (X): Breaking schema changes, removed fields, incompatible updates
   - MINOR (Y): New features, new artifact types, new optional fields, backward-compatible additions
   - PATCH (Z): Bug fixes, documentation improvements, schema clarifications, typo fixes

4. **Use Automated Script** (prevents inconsistencies):
   ```bash
   ./scripts/bump-framework-version.sh "X.Y.Z" "Release notes describing changes"
   # Script updates: VERSION, README.md, MAINTENANCE.md, integration_specification.yaml
   # Script enforces consistency, creates commit, prevents human error
   ```

5. **If Manual Bump Required**, update ALL 4 files:
   - VERSION (line 1)
   - README.md (header: "# Emergent Product Framework (EPF) Repository - vX.Y.Z")
   - MAINTENANCE.md ("**Current Framework Version:** vX.Y.Z")
   - integration_specification.yaml (version: "X.Y.Z", epf_version: "X.Y.Z")

6. **Git Hook Will Validate** before commit succeeds

**Version Bump Decision Tree**:

```
Making framework changes?
├─ YES → Will this affect how users understand/use EPF?
│   ├─ YES → Determine type:
│   │   ├─ Breaking changes? → MAJOR (X.0.0)
│   │   ├─ New features? → MINOR (0.Y.0)
│   │   └─ Docs/fixes? → PATCH (0.0.Z)
│   └─ Run ./scripts/bump-framework-version.sh
└─ NO → Proceed with commit
```

**This Case Analysis**:
- Change: WHY-HOW-WHAT ontology alignment across all docs
- Impact: Clarifies fundamental framework concepts, affects understanding
- Breaking? NO (no schema changes)
- New features? NO (no new capabilities)
- Docs/fixes? YES (documentation clarification)
- **Verdict: PATCH release (2.0.0 → 2.0.1)**

**Prevention Checklist** (use BEFORE committing framework changes):
- [ ] Have I made changes to docs, schemas, templates, or wizards?
- [ ] Will this change how users understand or apply EPF?
- [ ] Have I consulted MAINTENANCE.md version management rules?
- [ ] Have I determined if this is MAJOR, MINOR, or PATCH?
- [ ] Have I run ./scripts/bump-framework-version.sh with release notes?
- [ ] OR have I manually updated all 4 version markers consistently?
- [ ] Will the git pre-commit hook pass (version consistency check)?

**Time Cost**:
- Wrong approach (commit docs → user notices → bump version → separate commit): ~10 minutes
- Correct approach (bump version as part of change workflow): ~3 minutes
- **Wasted time**: ~7 minutes, plus user interruption and trust impact
- **Reputational cost**: User questions "Why didn't the EPF process notice this?"

**Impact**:
- Demonstrates lack of process discipline and checklist thinking
- User had to catch something that should be automatic
- Framework changes appeared "incomplete" without version update
- Committed documentation changes without corresponding version metadata
- Raises question about AI agent's ability to follow EPF's own protocols

**Key Takeaway**: **VERSION MANAGEMENT IS NOT OPTIONAL.** EPF has explicit protocols for version bumps, automated tooling to prevent mistakes, and git hooks to enforce consistency. Before committing ANY framework change (docs, schemas, templates, wizards), check if version bump is needed. Documentation clarifications that affect understanding ARE version-worthy (PATCH). Use the version bump decision tree. When in doubt, bump the version—over-versioning is better than under-versioning.

**Related Files/Conventions**:
- `/Users/nikolai/Code/epf/MAINTENANCE.md` (Version Management section, lines 660-690)
- `/Users/nikolai/Code/epf/scripts/bump-framework-version.sh` (automated version bump tool)
- `/Users/nikolai/Code/epf/.git/hooks/pre-commit` (version consistency enforcement)
- This applies to ANY framework repository with semantic versioning and release management

---

### 2026-01-13 - Failed to Run classify-changes.sh Before Major Commit (Pre-commit Hook Not Installed)

**Context**: After creating 131 canonical track definitions, updating value models, and enhancing health checks (193 files, 54,597 insertions), committed all changes without running `./scripts/classify-changes.sh` first. User had to remind me: "Seems you missed the pre commit hook for assessing epf version bump."

**Mistake**: Made a massive framework commit (2.5.0 level work) without:
1. Running `./scripts/classify-changes.sh` to assess version bump requirement
2. Checking if the pre-commit hook was installed
3. Following the version management protocol in `.ai-agent-instructions.md` STEP 0

**Why It Was Wrong**:
1. **Pre-commit hook script existed** - `scripts/pre-commit-version-check.sh` was designed for this
2. **BUT hook wasn't installed** - `.git/hooks/pre-commit` didn't exist
3. **No automated enforcement** - relied entirely on AI memory to run classifier
4. **User had to catch the mistake** - AGAIN (see 2025-12-30 entry)
5. **Same mistake pattern** - failing to treat version management as mandatory

**Root Cause**:
- Pre-commit hook script exists at `scripts/pre-commit-version-check.sh` 
- But it was never installed to `.git/hooks/pre-commit`
- Without installation, the hook provides zero protection
- AI relied on memory ("I should run classifier") rather than automated enforcement
- Didn't verify hook installation before major work session

**Correct Approach - Verify Hook Installation Before Major Work**:

1. **At session start**, verify hooks are installed:
   ```bash
   ls -la .git/hooks/pre-commit  # Should show installed hook
   ```

2. **If not installed**, install immediately:
   ```bash
   cp scripts/pre-commit-version-check.sh .git/hooks/pre-commit
   chmod +x .git/hooks/pre-commit
   ```

3. **Before any commit**, the hook now automatically:
   - Runs `classify-changes.sh --staged`
   - Blocks commit if version bump is needed
   - Validates version consistency across 4 files

4. **Manual backup check** - even with hook, run before major changes:
   ```bash
   ./scripts/classify-changes.sh  # See what type of bump is needed
   ```

**What Was Fixed**:
1. **Installed pre-commit hook**: `cp scripts/pre-commit-version-check.sh .git/hooks/pre-commit`
2. **Updated classify-changes.sh**: Now recognizes `definitions/` directory
3. **Added this lesson**: Future sessions will verify hook installation

**Prevention Checklist** (use at START of any EPF session):
- [ ] Is pre-commit hook installed? `ls .git/hooks/pre-commit`
- [ ] If not, install it: `cp scripts/pre-commit-version-check.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit`
- [ ] Does classify-changes.sh recognize all file types? (Test with `./scripts/classify-changes.sh`)
- [ ] Before major commits, manually run `./scripts/classify-changes.sh` as backup

**Time Cost**:
- Wrong approach (massive commit → user notices → bump version → extra commit): ~15 minutes
- Correct approach (hook blocks → bump version → commit with version): ~5 minutes
- **Wasted time**: ~10 minutes, plus user frustration ("why didn't this work?")

**Impact**:
- User had to catch the same type of mistake again
- Demonstrates that having tooling is not enough—tooling must be INSTALLED
- Trust erosion: "The framework has checks, but the AI didn't use them"

**Key Takeaway**: **TOOLING MUST BE INSTALLED TO WORK.** Having a pre-commit hook script in `scripts/` is meaningless if it's not installed in `.git/hooks/`. At the start of every EPF session, verify that enforcement hooks are active. Automation only prevents mistakes when it's actually running.

**Related Files/Conventions**:
- `scripts/pre-commit-version-check.sh` - The hook script (must be installed)
- `.git/hooks/pre-commit` - Where the hook must be installed
- `scripts/classify-changes.sh` - Change classifier (used by hook)
- `scripts/install-version-hooks.sh` - Helper to install hooks

---

## Instructions for Future Sessions

When you encounter this file:

1. **Read it completely** before starting work on related areas
2. **Check for relevant lessons** related to your current task
3. **Add new lessons** when mistakes happen
4. **Update existing lessons** if you discover additional context

This is a living document. Every mistake is an opportunity to improve.

**⚠️ SESSION START CHECKLIST (verify these first):**
```bash
# 1. Pre-commit hook installed?
ls -la .git/hooks/pre-commit || echo "❌ HOOK NOT INSTALLED"

# 2. If not installed:
cp scripts/pre-commit-version-check.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit

# 3. Verify classifier works:
./scripts/classify-changes.sh --help
```
