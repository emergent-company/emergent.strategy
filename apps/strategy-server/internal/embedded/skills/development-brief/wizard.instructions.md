# Development Handover Brief Generator - Wizard Instructions

**Version:** 1.0.0  
**Schema Version:** 1.0.0  
**Purpose:** Generate engineering handover briefs from EPF artifacts for development team implementation proposals  
**Output Format:** Markdown document with structured sections and EPF artifact links  
**Target Audience:** Engineering/development teams receiving implementation scope from product management

---

## 🤖 FOR AI ASSISTANTS: READ THIS BEFORE PROCEEDING

⚠️ **STOP - DO NOT CREATE CUSTOM CODE**

If you are an AI assistant asked to generate a development handover brief:

❌ **DO NOT** create a custom Python/Node/etc script  
❌ **DO NOT** try to "optimize" or "simplify" this wizard  
❌ **DO NOT** skip phases or combine steps  
❌ **DO NOT** invent your own brief structure  

✅ **DO** follow this wizard EXACTLY as written  
✅ **DO** execute each phase sequentially (0 → 0.5 → 1 → 2 → 3 → 4 → 5)  
✅ **DO** stop at Phase 0.5 for mandatory user selections  
✅ **DO** validate with `validator.sh` (must be 0 errors)  
✅ **DO** save output to the CORRECT location (see below)

📁 **CRITICAL OUTPUT LOCATION:**
```
docs/EPF/_instances/{product}/outputs/development-briefs/{brief-slug}-{date}.md
```
⚠️ **NOT** `cycles/` - that folder is for archived planning cycles, NOT output artifacts!

**Why this matters:
- This wizard encodes the bridge between **EPF strategic artifacts** and **engineering execution**
- The brief structure is designed for **implementation proposal workflows**
- Engineering teams need **traceable links** back to EPF artifacts for context
- Calibration inputs ensure **aligned expectations** on scope and quality

**This wizard IS the implementation.** Your job is to EXECUTE it, not rewrite it.

**See also:** `docs/EPF/outputs/AI_INSTRUCTIONS.md` for complete guidance.

---

## ⚠️ CRITICAL: ALWAYS RUN PHASES IN ORDER - DO NOT SKIP

This wizard MUST be executed sequentially. Each phase depends on the previous one.

## Generation Process Overview

### ✅ **Phase 0.0: Brief Context Collection (MANDATORY - User provides title, summary, timeline context)**
### ✅ Phase 0: EPF Instance Validation (MANDATORY - Verify artifacts exist)
### ✅ **Phase 0.5: Interactive Selection (MANDATORY - User selects features, value model components, calibration)**
### Phase 1: EPF Data Extraction
### Phase 2: Tech Stack Impact Analysis
### Phase 3: Document Assembly
### Phase 4: Questions & Success Criteria Generation
### Phase 5: Validation

**⚠️ STOP AFTER PHASE 0.5 AND GET USER CONFIRMATION BEFORE PROCEEDING TO PHASE 1**

---

## Phase 0.0: Brief Context Collection

⚠️ **MANDATORY FIRST STEP - User must provide implementation context**

**Critical Context:** EPF artifacts contain strategic product definitions but do NOT contain:
- Implementation timeline expectations
- Engineering team capacity/constraints
- Tech stack decisions for this specific implementation
- Scope calibration for MVP vs full delivery

### Step 0.0.1: Collect Brief Identity

```
Present to user:
═══════════════════════════════════════════════════════════════════════════════
📋 DEVELOPMENT HANDOVER BRIEF SETUP
═══════════════════════════════════════════════════════════════════════════════

I'll help you generate an engineering handover brief from EPF artifacts.

First, let's establish the brief's identity:

1. Brief Title (10-100 chars):
   Example: "Digital Identity Security Features - Engineering Brief"
   
2. Executive Summary (2-4 sentences):
   What is being built and why? What business value does it deliver?
   
3. Target Engineering Team/Area (optional):
   Example: "Platform Security Team", "Full-stack API team"

4. Expected Implementation Timeframe (optional):
   Example: "Q1 2026", "8-12 weeks", "Phase 1 of 3"

═══════════════════════════════════════════════════════════════════════════════
```

**Collect and validate:**
- `brief_title`: Required, 10-100 characters
- `brief_summary`: Required, 50-1000 characters, should explain WHAT and WHY
- `target_team`: Optional, helps contextualize the brief
- `timeframe`: Optional, provides timeline context

### Step 0.0.2: Collect EPF Instance Path

```
Present to user:
═══════════════════════════════════════════════════════════════════════════════
📁 EPF INSTANCE PATH
═══════════════════════════════════════════════════════════════════════════════

Which EPF instance should I use?

Example: docs/EPF/_instances/emergent
         docs/EPF/_instances/twentyfirst

This directory should contain:
  - FIRE/feature_definitions/ (feature definition files)
  - value_models/ (value model files)
  - 05_roadmap_recipe.yaml (roadmap with KRs)

EPF instance path: _____________

═══════════════════════════════════════════════════════════════════════════════
```

**Validate path exists and has required structure.**

### Step 0.0.3: Collect GitHub Repository Configuration

```
Present to user:
═══════════════════════════════════════════════════════════════════════════════
🔗 GITHUB REPOSITORY CONFIGURATION
═══════════════════════════════════════════════════════════════════════════════

The development brief will include GitHub permalinks to EPF artifacts.
This allows the brief to be shared outside VS Code (Slack, email, Notion, etc.)

1. Repository Owner (required):
   Example: "eyedea-io", "octocat"
   
2. Repository Name (required):
   Example: "lawmatics", "my-project"

3. Branch Name (required, default: "dev"):
   Example: "main", "dev", "develop"
   Note: Use your default branch for stable links

4. Commit SHA (optional - for immutable links):
   Example: "a1b2c3d4..." (40 chars)
   Leave blank for branch-based links

═══════════════════════════════════════════════════════════════════════════════
```

**Auto-detection hint:** If in a git repository, offer to auto-detect:
```python
import subprocess

def detect_github_config():
    try:
        # Get remote URL
        remote = subprocess.check_output(['git', 'remote', 'get-url', 'origin'], text=True).strip()
        # Parse github.com:owner/repo.git or https://github.com/owner/repo.git
        if 'github.com' in remote:
            parts = remote.replace('git@github.com:', '').replace('https://github.com/', '').replace('.git', '').split('/')
            if len(parts) >= 2:
                return {'owner': parts[0], 'repo': parts[1]}
        
        # Get current branch
        branch = subprocess.check_output(['git', 'branch', '--show-current'], text=True).strip()
        
        # Get current commit (optional)
        commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
        
        return {'owner': None, 'repo': None, 'branch': branch, 'commit_sha': commit}
    except:
        return None
```

**Validate:**
- `github_owner`: Required, alphanumeric with hyphens
- `github_repo`: Required, valid repo name
- `github_branch`: Required, defaults to "dev" or "main"
- `commit_sha`: Optional, 40 hex characters if provided

### Step 0.0.4: Store Context

```python
# Helper function for generating GitHub permalinks
def make_github_permalink(relative_path, github_config):
    """
    Convert a relative file path to a GitHub permalink URL.
    
    Args:
        relative_path: Path relative to repo root (e.g., "docs/EPF/_instances/foo/fd-001.yaml")
        github_config: Dict with owner, repo, branch, and optional commit_sha
    
    Returns:
        GitHub permalink URL
    """
    owner = github_config['owner']
    repo = github_config['repo']
    ref = github_config.get('commit_sha') or github_config['branch']
    
    # Remove leading ./ or / if present
    clean_path = relative_path.lstrip('./')
    
    return f"https://github.com/{owner}/{repo}/blob/{ref}/{clean_path}"

brief_context = {
    'title': brief_title,
    'summary': brief_summary,
    'target_team': target_team,  # Optional
    'timeframe': timeframe,       # Optional
    'epf_instance_path': epf_instance_path,
    'github_config': {
        'owner': github_owner,
        'repo': github_repo,
        'branch': github_branch,
        'commit_sha': commit_sha  # Optional
    }
}
```

---

## Phase 0: EPF Instance Validation

**Verify all required EPF artifacts exist and are accessible.**

### Step 0.1: Verify Core EPF Files

```yaml
Required:
- {epf_instance_path}/FIRE/feature_definitions/*.yaml  # At least 1 feature definition
- {epf_instance_path}/value_models/*.yaml              # At least 1 value model
- {epf_instance_path}/05_roadmap_recipe.yaml           # Roadmap with KRs

Optional (enhance brief quality):
- {epf_instance_path}/00_north_star.yaml               # Strategic context
- {epf_instance_path}/04_strategy_formula.yaml         # Market/competitive context
```

### Step 0.2: Scan Available Feature Definitions

```python
# Scan for all feature definitions
feature_files = glob.glob(f"{epf_instance_path}/FIRE/feature_definitions/fd-*.yaml")

available_features = []
for file_path in feature_files:
    fd_data = load_yaml(file_path)
    available_features.append({
        'id': fd_data['id'],
        'name': fd_data['name'],
        'status': fd_data.get('status', 'unknown'),
        'path': file_path,
        'capabilities': [cap['id'] for cap in fd_data.get('definition', {}).get('capabilities', [])],
        'strategic_context': fd_data.get('strategic_context', {}).get('problem_statement', '')[:200]
    })

if not available_features:
    print("❌ No feature definitions found in FIRE/feature_definitions/")
    print("   Create feature definitions first using the feature_definition wizard")
    exit(1)

print(f"✅ Found {len(available_features)} feature definitions")
```

### Step 0.3: Scan Value Models

```python
# Scan for value models
value_model_files = glob.glob(f"{epf_instance_path}/value_models/*.yaml")

available_value_models = []
for file_path in value_model_files:
    vm_data = load_yaml(file_path)
    available_value_models.append({
        'track': vm_data.get('track_name', 'Product'),
        'path': file_path,
        'layers': [
            {
                'id': layer['id'],
                'name': layer['name'],
                'components': [
                    {
                        'id': comp['id'],
                        'name': comp['name'],
                        'sub_components': [
                            {'id': sub['id'], 'name': sub['name'], 'active': sub.get('active', False)}
                            for sub in comp.get('subs', [])
                        ]
                    }
                    for comp in layer.get('components', [])
                ]
            }
            for layer in vm_data.get('layers', [])
        ]
    })

print(f"✅ Found {len(available_value_models)} value models")
```

### Step 0.4: Load Roadmap KRs

```python
# Load roadmap for KR reference
roadmap_path = f"{epf_instance_path}/05_roadmap_recipe.yaml"
if os.path.exists(roadmap_path):
    roadmap_data = load_yaml(roadmap_path)
    tracks = roadmap_data.get('roadmap', {}).get('tracks', {})
    
    available_krs = []
    for track_name, track_data in tracks.items():
        for okr in track_data.get('okrs', []):
            for kr in okr.get('key_results', []):
                available_krs.append({
                    'id': kr['id'],
                    'title': kr['title'],
                    'track': track_name,
                    'okr_objective': okr['objective']
                })
    
    print(f"✅ Found {len(available_krs)} Key Results in roadmap")
else:
    print("⚠️  No roadmap found - KR linking will be skipped")
    available_krs = []
```

**Validation Checkpoint:**
- [ ] At least 1 feature definition exists
- [ ] At least 1 value model exists
- [ ] All file paths are readable

---

## Phase 0.5: Interactive Selection

⚠️ **MANDATORY INTERACTIVE PHASE - DO NOT AUTO-SELECT**

This phase collects four critical inputs from the user:
1. **Feature Selection** - Which feature definitions to include
2. **Existing Implementation Context** - Prior work on these features
3. **Value Model Mapping** - Which components receive value
4. **Calibration Input** - Implementation ambition and constraints

### Step 0.5.1: Feature Definition Selection

```
Present to user:
═══════════════════════════════════════════════════════════════════════════════
📋 STEP 1/3: SELECT FEATURE DEFINITIONS
═══════════════════════════════════════════════════════════════════════════════

Which feature definitions should this brief cover?

Available Features:
┌─────┬────────────┬────────────────────────────────────────────────────────────┬──────────┐
│  #  │ ID         │ Name                                                       │ Status   │
├─────┼────────────┼────────────────────────────────────────────────────────────┼──────────┤
│  1  │ fd-017     │ Digital Identity Account Recovery                          │ ready    │
│  2  │ fd-018     │ Step-Up Verification                                       │ ready    │
│  3  │ fd-019     │ Invoice Automation                                         │ draft    │
└─────┴────────────┴────────────────────────────────────────────────────────────┴──────────┘

For each selected feature, you can optionally specify:
- Priority: must-have / should-have / nice-to-have
- Specific capabilities to include (or all)

Enter selection (e.g., "1,2" or "1:must-have, 2:should-have"):
═══════════════════════════════════════════════════════════════════════════════
```

**Collect:**
- Feature IDs to include
- Priority level for each (default: must-have)
- Optional: specific capabilities per feature

**For each selected feature, offer capability drill-down:**

```
Present if user wants capability detail:
═══════════════════════════════════════════════════════════════════════════════
📋 CAPABILITIES FOR: fd-017 - Digital Identity Account Recovery
═══════════════════════════════════════════════════════════════════════════════

Include all capabilities, or select specific ones?

Available Capabilities:
┌─────┬──────────┬─────────────────────────────────────────────────────────────┐
│  #  │ ID       │ Name                                                        │
├─────┼──────────┼─────────────────────────────────────────────────────────────┤
│  1  │ cap-001  │ BankID Identity Verification                                │
│  2  │ cap-002  │ Identity-to-Account Matching                                │
│  3  │ cap-003  │ Password Reset via Identity                                 │
│  4  │ cap-004  │ Session Revocation on Recovery                              │
│  5  │ cap-005  │ Recovery Audit Trail                                        │
└─────┴──────────┴─────────────────────────────────────────────────────────────┘

Selection (enter for ALL, or comma-separated numbers): _____________
═══════════════════════════════════════════════════════════════════════════════
```

### Step 0.5.1b: Existing Implementation Context

**For each selected feature, determine if prior implementation exists:**

```
Present to user:
═══════════════════════════════════════════════════════════════════════════════
📋 EXISTING IMPLEMENTATION CHECK
═══════════════════════════════════════════════════════════════════════════════

For each selected feature, does existing implementation already exist?

┌─────┬────────────┬────────────────────────────────────────────┬───────────────┐
│  #  │ Feature    │ Name                                       │ Has Existing? │
├─────┼────────────┼────────────────────────────────────────────┼───────────────┤
│  1  │ fd-017     │ Digital Identity Account Recovery          │ [Y/N]         │
│  2  │ fd-018     │ Step-Up Verification                       │ [Y/N]         │
└─────┴────────────┴────────────────────────────────────────────┴───────────────┘

Enter features with existing implementation (e.g., "1" or "1,2" or "none"):
═══════════════════════════════════════════════════════════════════════════════
```

**For each feature with existing implementation, collect details:**

```
Present to user:
═══════════════════════════════════════════════════════════════════════════════
📋 EXISTING IMPLEMENTATION: fd-017 - Digital Identity Account Recovery
═══════════════════════════════════════════════════════════════════════════════

Describe the current implementation state:

MATURITY LEVEL:
  [1] Prototype  - Proof of concept, not production-ready
  [2] MVP        - Basic functionality in production
  [3] Production - Full functionality, actively used
  [4] Mature     - Stable, well-tested, optimized

Selection: _____________

CURRENT STATE DESCRIPTION:
Describe what currently exists (20+ chars):
Example: "Basic password reset via email exists. No identity verification."

Description: _____________

CODE REFERENCES (where relevant code lives):
Format: location | description | relevance (extend/modify/replace/reference)
Example: "libs/lib-api/src/auth/ | Current auth module | extend"

Enter code references (one per line, empty line to finish):
_____________

CURRENT LIMITATIONS:
What's missing or limited in the current implementation?
Example: "No identity verification", "Only email-based recovery"

Enter limitations (one per line, empty line to finish):
_____________

KNOWN TECHNICAL DEBT:
Any technical debt that affects this feature?
Example: "Auth module needs refactoring", "No audit logging"

Enter technical debt items (one per line, empty line to finish):
_____________

═══════════════════════════════════════════════════════════════════════════════
```

**Collect implementation delta for features with existing work:**

```
Present to user:
═══════════════════════════════════════════════════════════════════════════════
📋 IMPLEMENTATION DELTA: What's Changing?
═══════════════════════════════════════════════════════════════════════════════

Summarize the overall delta (what's changing from current state):
Example: "Adding BankID identity verification as alternative recovery path.
         Extending existing password reset to support identity-based flow.
         Adding audit logging for all recovery events."

Delta Summary (50+ chars): _____________

CAPABILITY CHANGES:
For each capability, specify the change type:
  [N] New        - Doesn't exist, building from scratch
  [E] Enhanced   - Exists, adding functionality
  [R] Refactored - Same functionality, different implementation
  [U] Unchanged  - No changes to existing

┌─────┬──────────┬─────────────────────────────────────────────────┬────────────┐
│  #  │ ID       │ Capability                                      │ Change     │
├─────┼──────────┼─────────────────────────────────────────────────┼────────────┤
│  1  │ cap-001  │ BankID Identity Verification                    │ [N/E/R/U]  │
│  2  │ cap-002  │ Identity-to-Account Matching                    │ [N/E/R/U]  │
│  3  │ cap-003  │ Password Reset via Identity                     │ [N/E/R/U]  │
│  4  │ cap-004  │ Session Revocation on Recovery                  │ [N/E/R/U]  │
│  5  │ cap-005  │ Recovery Audit Trail                            │ [N/E/R/U]  │
└─────┴──────────┴─────────────────────────────────────────────────┴────────────┘

Enter changes (e.g., "1:N, 2:N, 3:E, 4:E, 5:N"):
═══════════════════════════════════════════════════════════════════════════════
```

**Collect breaking changes and migrations:**

```
Present to user:
═══════════════════════════════════════════════════════════════════════════════
📋 BREAKING CHANGES & MIGRATIONS
═══════════════════════════════════════════════════════════════════════════════

BREAKING CHANGES:
Are there any breaking changes to existing functionality?
Format: change | impact | migration path

Example: "Password reset API signature changing | All clients using reset API | 
         Version API endpoint, deprecate old after 2 releases"

Enter breaking changes (one per line, empty line if none):
_____________

MIGRATIONS REQUIRED:
Any database, data, or configuration migrations?
Format: type (database/data/config/api) | description | complexity (trivial/moderate/complex)

Example: "database | Add identity_links table | trivial"
Example: "data | Backfill identity links for existing users | moderate"

Enter migrations (one per line, empty line if none):
_____________

BACKWARDS COMPATIBILITY:
Is backwards compatibility required? [Y/N]: _____________

If yes:
- How long? (e.g., "2 releases", "6 months"): _____________
- Approach? (e.g., "Version API", "Feature flag"): _____________

═══════════════════════════════════════════════════════════════════════════════
```

### Step 0.5.2: Value Model Component Mapping

```
Present to user:
═══════════════════════════════════════════════════════════════════════════════
📋 STEP 2/4: MAP VALUE MODEL COMPONENTS
═══════════════════════════════════════════════════════════════════════════════

Which value model components will receive value from this implementation?

The selected features contribute to these areas (auto-detected from feature 
strategic_context.contributes_to):
  - Product.Security.Identity-Management
  - Product.Compliance.Audit-Logging

You can confirm, modify, or add additional components.

Available Value Model Structure:
┌────────┬──────────────────────────────────────────────────────────────────────┐
│ Track  │ Product                                                              │
├────────┼──────────────────────────────────────────────────────────────────────┤
│ Layers │ L1: core-platform                                                    │
│        │   └─ L2: user-authentication                                         │
│        │        └─ L3: password-management ✓, mfa-support ✓, sso ○           │
│        │   └─ L2: identity-management                                         │
│        │        └─ L3: identity-linking ○, identity-verification ○           │
│        │                                                                      │
│        │ L1: compliance-security                                              │
│        │   └─ L2: audit-logging                                               │
│        │        └─ L3: security-events ✓, compliance-reports ○               │
└────────┴──────────────────────────────────────────────────────────────────────┘

✓ = currently active    ○ = planned/inactive

Enter components to include (e.g., "core-platform/identity-management"):
═══════════════════════════════════════════════════════════════════════════════
```

**Collect:**
- Track → Layer → Component paths
- Optional: specific sub-components being activated

### Step 0.5.3: Calibration Input

```
Present to user:
═══════════════════════════════════════════════════════════════════════════════
📋 STEP 3/4: CALIBRATION - Implementation Ambition & Constraints
═══════════════════════════════════════════════════════════════════════════════

This calibration helps engineering understand the expected scope and quality.

SCOPE LEVEL:
Choose the target implementation scope:
  [1] MVP        - Minimal viable implementation, core functionality only
  [2] Functional - Complete functionality, basic UX, standard quality
  [3] Polished   - High-quality UX, comprehensive error handling
  [4] Enterprise - Production-hardened, full compliance, enterprise-grade

Selection: _____________

TIMELINE PRESSURE:
What's the timeline pressure on this implementation?
  [1] Relaxed    - Flexible timeline, quality over speed
  [2] Normal     - Standard planning, balanced trade-offs
  [3] Aggressive - Tight timeline, some trade-offs acceptable
  [4] Critical   - Hard deadline, must ship on time

Selection: _____________

QUALITY EXPECTATIONS:
Rate expectations for each quality dimension:

Test Coverage:    [1] Minimal  [2] Standard  [3] Comprehensive
Documentation:    [1] Minimal  [2] Standard  [3] Comprehensive
Performance:      [1] Acceptable  [2] Optimized  [3] Enterprise-grade
Security:         [1] Basic  [2] Standard  [3] Hardened

═══════════════════════════════════════════════════════════════════════════════
```

**Additional calibration prompts:**

```
Present to user:
═══════════════════════════════════════════════════════════════════════════════
📋 CONSTRAINTS (Optional)
═══════════════════════════════════════════════════════════════════════════════

Are there any known constraints on this implementation?

Types: technical, timeline, resource, compliance, dependency, business

Example constraints:
- "technical: Must use existing Signicat integration patterns"
- "dependency: Requires Auth0 custom action support"
- "compliance: Must be GDPR compliant for identity data"

Enter constraints (one per line, empty line to finish):
═══════════════════════════════════════════════════════════════════════════════
```

```
Present to user:
═══════════════════════════════════════════════════════════════════════════════
📋 DEFERRED SCOPE (Optional)
═══════════════════════════════════════════════════════════════════════════════

Are there items explicitly NOT included in this version?

Identifying deferred scope helps prevent scope creep and sets clear expectations.

Example:
- "Enterprise group policy inheritance - Future when multi-org support ships"
- "Swedish BankID support - Future international expansion phase"

Enter deferred items (one per line, empty line to finish):
═══════════════════════════════════════════════════════════════════════════════
```

### Step 0.5.4: Related Key Results (Optional)

```
Present to user:
═══════════════════════════════════════════════════════════════════════════════
📋 RELATED KEY RESULTS (Optional)
═══════════════════════════════════════════════════════════════════════════════

Which roadmap Key Results does this implementation advance?

Available KRs from roadmap:
┌─────┬────────────┬────────────────────────────────────────────────────────────┐
│  #  │ KR ID      │ Title                                                      │
├─────┼────────────┼────────────────────────────────────────────────────────────┤
│  1  │ kr-p-003   │ Enterprise security feature set complete                   │
│  2  │ kr-p-004   │ Identity verification integration live                     │
│  3  │ kr-c-002   │ Premium security tier launched                             │
└─────┴────────────┴────────────────────────────────────────────────────────────┘

Enter related KRs (comma-separated, or skip): _____________
═══════════════════════════════════════════════════════════════════════════════
```

### Step 0.5.5: Selection Summary & Confirmation

```
Present to user:
═══════════════════════════════════════════════════════════════════════════════
✅ SELECTION SUMMARY
═══════════════════════════════════════════════════════════════════════════════

Brief: {brief_title}

FEATURES:
  ✓ fd-017: Digital Identity Account Recovery (must-have)
    └─ All capabilities included
  ✓ fd-018: Step-Up Verification (should-have)
    └─ Capabilities: cap-001, cap-002, cap-003

VALUE MODEL COMPONENTS:
  ✓ Product → core-platform → identity-management
  ✓ Product → compliance-security → audit-logging

CALIBRATION:
  Scope Level:     Functional
  Timeline:        Normal
  Test Coverage:   Standard
  Documentation:   Standard
  Performance:     Acceptable
  Security:        Standard

CONSTRAINTS:
  • technical: Must use existing Signicat integration patterns
  • dependency: Requires Auth0 custom action support

DEFERRED SCOPE:
  • Enterprise group policy inheritance
  • Swedish BankID support

RELATED KRs:
  • kr-p-003: Enterprise security feature set complete
  • kr-p-004: Identity verification integration live

═══════════════════════════════════════════════════════════════════════════════
Proceed with brief generation? [Y/n]: _____________
═══════════════════════════════════════════════════════════════════════════════
```

**⚠️ STOP: Get explicit confirmation before proceeding to Phase 1**

---

## Phase 1: EPF Data Extraction

Extract detailed data from selected EPF artifacts.

### Step 1.1: Extract Feature Definition Details

For each selected feature:

```yaml
# Extract from feature definition files:
id: fd.id
name: fd.name
slug: fd.slug
status: fd.status

strategic_context:
  problem_statement: fd.strategic_context.problem_statement
  market_context: fd.strategic_context.market_context
  contributes_to: fd.strategic_context.contributes_to
  success_metrics: fd.strategic_context.success_metrics[]

definition:
  job_to_be_done: fd.definition.job_to_be_done
  solution_approach: fd.definition.solution_approach
  capabilities: fd.definition.capabilities[]  # id, name, description

contexts: fd.contexts[]  # UI/API contexts where feature appears

value_propositions: fd.value_propositions[]  # Personas and their value
```

### Step 1.2: Extract Value Model Component Details

For each selected value model component:

```yaml
# Extract from value model files:
track_name: vm.track_name
layer:
  id: layer.id
  name: layer.name
  description: layer.description
component:
  id: component.id
  name: component.name
  description: component.description
  sub_components: component.subs[]  # id, name, active status
```

### Step 1.3: Extract Roadmap KR Details

For each related KR:

```yaml
# Extract from roadmap:
kr_id: kr.id
title: kr.title
description: kr.description
metrics: kr.metrics[]
assumptions: kr.assumptions[]
trl_progression:
  trl_start: kr.trl_start
  trl_target: kr.trl_target
```

### Step 1.4: Extract North Star Context (if available)

```yaml
# Optional context enrichment from North Star:
purpose: north_star.purpose.statement
vision: north_star.vision.statement
core_beliefs: north_star.core_beliefs[]
personas: north_star.personas[]  # Match to feature personas
```

**Validation Checkpoint:**
- [ ] All selected features extracted
- [ ] Value model components extracted
- [ ] KRs extracted (if selected)
- [ ] No missing required fields

---

## Phase 2: Tech Stack Impact Analysis

Synthesize technology impact from feature contexts and capabilities.

### Step 2.1: Identify Affected Services

Analyze feature contexts to determine service impact:

```python
# Scan feature contexts for service indicators
service_patterns = {
    'api': ['GraphQL', 'REST', 'resolver', 'endpoint', 'mutation', 'query'],
    'web': ['React', 'frontend', 'UI', 'modal', 'screen', 'form'],
    'worker': ['background', 'job', 'async', 'queue', 'scheduled'],
}

affected_services = {}
for feature in selected_features:
    for context in feature['contexts']:
        for service, patterns in service_patterns.items():
            if any(pattern.lower() in context['description'].lower() for pattern in patterns):
                if service not in affected_services:
                    affected_services[service] = {'impact': 'integration', 'notes': []}
                affected_services[service]['notes'].append(
                    f"{feature['name']}: {context['name']}"
                )
```

### Step 2.2: Identify External Integrations

```python
# Scan for external integration mentions
integration_keywords = {
    'Auth0': ['auth0', 'authentication provider', 'identity provider'],
    'Signicat': ['signicat', 'bankid', 'digital identity', 'e-signature'],
    'Stripe': ['stripe', 'payment', 'billing'],
    'PostgreSQL': ['database', 'entity', 'table', 'migration'],
    'Redis': ['redis', 'cache', 'session', 'queue'],
}

# Extract from feature descriptions and capabilities
```

### Step 2.3: Identify Data Store Changes

```python
# From feature capabilities, identify potential schema changes:
data_changes = []
for feature in selected_features:
    for cap in feature['capabilities']:
        # Look for storage/persistence indicators
        if any(term in cap['description'].lower() for term in ['store', 'persist', 'save', 'log', 'record', 'track']):
            data_changes.append({
                'feature': feature['name'],
                'capability': cap['name'],
                'likely_change': 'New table or fields required'
            })
```

### Step 2.4: Generate Implementation Considerations

Based on extracted data, generate key implementation considerations:

```python
considerations = []

# From capabilities, identify patterns
for feature in selected_features:
    for cap in feature['capabilities']:
        # Identity matching pattern
        if 'matching' in cap['name'].lower() or 'link' in cap['name'].lower():
            considerations.append({
                'area': 'Identity Matching',
                'consideration': 'Map external identity to internal user account',
                'recommendation': 'Need to store verified identity during onboarding or add-identity flow'
            })
        
        # Audit trail pattern
        if 'audit' in cap['name'].lower() or 'log' in cap['name'].lower():
            considerations.append({
                'area': 'Audit Trail',
                'consideration': 'All recovery and verification events need logging',
                'recommendation': 'Use tamper-evident logging pattern for compliance'
            })
```

---

## Phase 3: Document Assembly

Assemble the development handover brief document.

### Step 3.1: Document Structure

```markdown
# {Brief Title}

> **Generated:** {ISO timestamp}
> **EPF Version:** {version}
> **Generator:** development-brief/wizard.instructions.md v1.0.0

---

## Overview

{brief_summary}

**Target Team:** {target_team if provided}
**Expected Timeframe:** {timeframe if provided}

### Scope Summary

| Dimension | Selection |
|-----------|-----------|
| Scope Level | {calibration.scope_level} |
| Timeline Pressure | {calibration.timeline_pressure} |
| Test Coverage | {calibration.quality_expectations.test_coverage} |
| Documentation | {calibration.quality_expectations.documentation} |
| Performance | {calibration.quality_expectations.performance} |
| Security | {calibration.quality_expectations.security} |

---

## Features Included

{For each selected feature:}

### {feature.id}: {feature.name}

**Priority:** {priority}
**Status:** {status}

**Problem Statement:**
{strategic_context.problem_statement}

**Solution Approach:**
{definition.solution_approach}

**Capabilities:**
{For each capability:}
- **{cap.id}: {cap.name}** - {cap.description}

**Contexts:**
{For each context:}
- **{context.name}** ({context.ui_location})
  - {context.description}

📄 **Full Definition:** [{feature_path}]({feature_path})

---

## Value Model Mapping

This implementation contributes to the following value model components:

{For each value_model_component:}

### {track} → {layer_name} → {component_name}

**Layer:** {layer_name} (`{layer_id}`)
**Component:** {component_name} (`{component_id}`)

**Sub-components affected:**
| ID | Name | Before | After |
|----|------|--------|-------|
{For each sub_component:}
| {sub.id} | {sub.name} | {status_before} | {status_after} |

📄 **Value Model:** [{value_model_path}]({value_model_path})

---

## Existing Implementation & Delta

{If any feature has existing implementation:}

### Current State

{For each feature with existing_implementation:}

#### {feature.id}: {feature.name}

**Maturity Level:** {existing_implementation.maturity_level}

**Current State:**
{existing_implementation.current_state}

**Code References:**
| Location | Description | Relevance |
|----------|-------------|-----------|
{For each code_reference:}
| `{location}` | {description} | {relevance} |

**Current Limitations:**
{For each limitation:}
- {limitation}

**Known Technical Debt:**
{For each tech_debt:}
- {tech_debt}

### Implementation Delta

**Summary:** {implementation_delta.delta_summary}

**Capability Changes:**
| Capability | Change Type | Description |
|------------|-------------|-------------|
{For each capability_change:}
| {capability_id} | {change_type} | {description} |

**Legend:** 🆕 New | ⬆️ Enhanced | 🔄 Refactored | ➖ Unchanged

{If breaking_changes:}
### Breaking Changes

| Change | Impact | Migration Path |
|--------|--------|----------------|
{For each breaking_change:}
| {change} | {impact} | {migration_path} |

{If migrations_required:}
### Required Migrations

| Type | Description | Complexity | Reversible |
|------|-------------|------------|------------|
{For each migration:}
| {type} | {description} | {complexity} | {reversible} |

{If backwards_compatibility.required:}
### Backwards Compatibility

- **Required:** Yes
- **Duration:** {backwards_compatibility.duration}
- **Approach:** {backwards_compatibility.approach}

---

{Else if no features have existing implementation:}

*This implementation is net-new with no existing code to extend or modify.*

---

## Tech Stack Impact

### Services Affected

{For each affected_service:}

#### {service_name}

**Impact Level:** {impact_level}

{notes}

### External Integrations

| Integration | Purpose | Existing? | Reuse Pattern |
|-------------|---------|-----------|---------------|
{For each integration:}
| {name} | {purpose} | {existing} | {reuse_patterns} |

### Data Store Changes

| Store | Expected Changes |
|-------|------------------|
{For each data_change:}
| {store} | {changes} |

---

## Implementation Considerations

{For each consideration:}

### {area}

**Consideration:** {consideration}

**Recommendation:** {recommendation}

---

## Calibration & Constraints

### Quality Expectations

- **Test Coverage:** {test_coverage_description}
- **Documentation:** {documentation_description}
- **Performance:** {performance_description}
- **Security:** {security_description}

### Constraints

{For each constraint:}
- **[{type}]** {description} *(Impact: {impact})*

### Deferred to Future

{For each deferred_item:}
- **{item}**
  - Rationale: {rationale}
  - Future: {future_consideration}

---

## Related Key Results

{For each related_kr:}

### {kr_id}: {kr_title}

**Track:** {track}
**Contribution:** {contribution}

📄 **Roadmap:** [{roadmap_path}]({roadmap_path})

---

## Questions for Engineering Review

{For each question:}

### Q{n}: {question}

**Context:** {context}

**Decision Impact:** {decision_impact}

{If suggested_options:}
**Potential Options:**
{For each option:}
- {option}

---

## Success Criteria

| Criterion | Measurement | Target |
|-----------|-------------|--------|
{For each success_criterion:}
| {criterion} | {measurement} | {target} |

---

## EPF Artifact Links

> **Note:** All links below are GitHub permalinks. If viewing outside VS Code,
> click to open the full EPF artifact on GitHub.

### Feature Definitions
{For each feature:}
- [{feature_id}: {feature_name}]({github_permalink}) - {description}

### Value Models
{For each value_model:}
- [{value_model_track}]({github_permalink}) - {description}

### Roadmap
- [Roadmap Recipe]({github_permalink_roadmap})
  - Relevant sections: {relevant_sections}

### North Star & Strategy (if referenced)
{If north_star:}
- [North Star]({github_permalink_north_star})
{If strategy_formula:}
- [Strategy Formula]({github_permalink_strategy})

### Supplementary
{For each supplementary_artifact:}
- [{artifact_name}]({github_permalink}) - {description}

---

## Next Steps

1. **Engineering Review:** Review this brief and prepare implementation proposal
2. **Architecture Discussion:** Address open questions in architecture review
3. **Estimation:** Provide effort estimates based on calibration scope
4. **Proposal:** Submit implementation proposal back to product management

---

*This brief was generated from EPF artifacts. For questions about product intent,
refer to the linked EPF documents or contact product management.*
```

### Step 3.2: Add Metadata Header

Add YAML frontmatter with GitHub permalinks:

```yaml
---
metadata:
  generated_at: "{ISO 8601 timestamp}"
  epf_version: "{from docs/EPF/VERSION}"
  generator: "development-brief/wizard.instructions.md"
  generator_version: "1.0.0"
  github_repo:
    owner: "{github_owner}"
    repo: "{github_repo}"
    branch: "{github_branch}"
    commit_sha: "{commit_sha if provided}"  # Optional
  epf_sources:
    # All paths are GitHub permalinks
    feature_definitions:
      - "https://github.com/{owner}/{repo}/blob/{branch}/{path_to_feature}"
    value_models:
      - "https://github.com/{owner}/{repo}/blob/{branch}/{path_to_value_model}"
    roadmap_recipe: "https://github.com/{owner}/{repo}/blob/{branch}/{roadmap_path}"
    north_star: "https://github.com/{owner}/{repo}/blob/{branch}/{north_star_path}"  # if used
brief_identity:
  title: "{brief_title}"
  target_team: "{target_team}"
  timeframe: "{timeframe}"
calibration:
  scope_level: "{scope_level}"
  timeline_pressure: "{timeline_pressure}"
  quality:
    test_coverage: "{test_coverage}"
    documentation: "{documentation}"
    performance: "{performance}"
    security: "{security}"
---
```

### Step 3.3: Generate Permalinks for All Paths

Use the `make_github_permalink` helper from Phase 0.0.4 to convert all file paths:

```python
# Convert all artifact paths to GitHub permalinks
def generate_all_permalinks(extracted_data, github_config):
    """Convert all file paths in extracted data to GitHub permalinks."""
    
    permalinks = {
        'feature_definitions': [],
        'value_models': [],
        'roadmap_recipe': None,
        'north_star': None,
        'strategy_formula': None
    }
    
    # Features
    for feature in extracted_data['features']:
        permalinks['feature_definitions'].append({
            'id': feature['id'],
            'name': feature['name'],
            'path': feature['path'],
            'permalink': make_github_permalink(feature['path'], github_config)
        })
    
    # Value models
    for vm in extracted_data['value_models']:
        permalinks['value_models'].append({
            'track': vm['track'],
            'path': vm['path'],
            'permalink': make_github_permalink(vm['path'], github_config)
        })
    
    # Core EPF documents
    if extracted_data.get('roadmap_path'):
        permalinks['roadmap_recipe'] = make_github_permalink(
            extracted_data['roadmap_path'], github_config
        )
    
    if extracted_data.get('north_star_path'):
        permalinks['north_star'] = make_github_permalink(
            extracted_data['north_star_path'], github_config
        )
    
    if extracted_data.get('strategy_path'):
        permalinks['strategy_formula'] = make_github_permalink(
            extracted_data['strategy_path'], github_config
        )
    
    return permalinks

# Generate permalinks for the document
permalinks = generate_all_permalinks(extracted_data, brief_context['github_config'])
```

---

## Phase 4: Questions & Success Criteria Generation

### Step 4.1: Generate Engineering Questions

Based on extracted data, generate relevant questions:

```python
questions = []

# From external integrations
for integration in external_integrations:
    if integration['existing']:
        questions.append({
            'question': f"Can we reuse the existing {integration['name']} integration for {integration['purpose']}, or do we need a separate flow?",
            'context': f"We already have {integration['name']} integrated for {integration['reuse_patterns']}. Need to determine if the same patterns apply.",
            'decision_impact': 'architecture'
        })

# From contexts that span multiple services
if len(affected_services) > 1:
    questions.append({
        'question': "Where should cross-service logic live - API gateway level or per-service?",
        'context': "This implementation touches multiple services. Need to determine orchestration approach.",
        'decision_impact': 'architecture'
    })

# From deferred scope items
for deferred in deferred_scope:
    questions.append({
        'question': f"How should we architect for future {deferred['item']}?",
        'context': f"This is deferred but may influence current design. {deferred['rationale']}",
        'decision_impact': 'architecture'
    })
```

### Step 4.2: Generate Success Criteria

```python
success_criteria = []

# From feature success metrics
for feature in selected_features:
    for metric in feature['strategic_context']['success_metrics']:
        success_criteria.append({
            'criterion': metric['metric'],
            'measurement': metric['measurement'],
            'target': metric['target']
        })

# From calibration
if calibration['quality_expectations']['security'] == 'hardened':
    success_criteria.append({
        'criterion': 'Security audit passed',
        'measurement': 'Third-party security review',
        'target': 'No critical or high vulnerabilities'
    })
```

---

## Phase 5: Validation

### Step 5.1: Run Validator

```bash
bash docs/EPF/outputs/development-brief/validator.sh {output-file}
```

### Step 5.2: Common Validation Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "Missing required section" | Section header not found | Add missing section |
| "Invalid EPF link" | Path doesn't exist | Verify artifact paths |
| "Empty features list" | No features selected | Re-run Phase 0.5 |
| "Missing calibration" | Calibration not collected | Re-run Phase 0.5.3 |

### Step 5.3: Output Location

⚠️ **CRITICAL: Save to the CORRECT folder!**

```
docs/EPF/_instances/{product}/outputs/development-briefs/{brief-slug}-{date}.md
```

**Example:** 
```
docs/EPF/_instances/lawmatics/outputs/development-briefs/kyc-aml-deployment-ready-2026-01-26.md
```

❌ **WRONG locations:**
- `docs/EPF/_instances/{product}/cycles/` ← This is for archived planning cycles!
- `docs/EPF/outputs/development-brief/` ← This is the generator definition!
- Root of `_instances/{product}/` ← Use the `outputs/` subdirectory!

✅ **CORRECT:** Always use `outputs/development-briefs/` within the product instance.

---

## Quality Checklist

Before delivering the brief:

### Completeness
- [ ] Title and summary present
- [ ] All selected features documented
- [ ] Value model mapping complete
- [ ] Tech stack impact analyzed
- [ ] Calibration captured
- [ ] EPF artifact links valid

### Traceability
- [ ] All EPF sources linked
- [ ] Feature → Value Model mapping clear
- [ ] KR relationships documented
- [ ] Metadata accurate

### Actionability
- [ ] Engineering questions are answerable
- [ ] Success criteria are measurable
- [ ] Constraints are clear
- [ ] Deferred scope explicit

### Calibration Alignment
- [ ] Scope matches selected level
- [ ] Quality expectations appropriate
- [ ] Constraints realistic
- [ ] Timeline pressure acknowledged

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-26 | Initial release |
