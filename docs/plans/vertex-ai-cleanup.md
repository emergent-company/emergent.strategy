# Vertex AI Configuration Cleanup Plan

**Status**: Planning  
**Created**: October 31, 2025  
**Priority**: HIGH  
**Type**: Breaking Change + Code Cleanup

---

## Executive Summary

The codebase currently has **dual embedding systems** and **redundant Vertex AI configuration variables**:

1. **GOOGLE_API_KEY** - Legacy, unused, should be removed
2. **VERTEX_EMBEDDING_PROJECT** vs **GCP_PROJECT_ID** - Duplicate configuration

**Goal**: Consolidate to single Vertex AI configuration using **GCP_PROJECT_ID** for all Google Cloud services.

---

## Current State Analysis

### ✅ Production Configuration (Already Correct!)

Current `.env` file:
```bash
EMBEDDING_PROVIDER=vertex
VERTEX_EMBEDDING_PROJECT=twentyfirst-io      # ← REDUNDANT
VERTEX_EMBEDDING_LOCATION=europe-north1
GCP_PROJECT_ID=spec-server-dev                # ← PRIMARY (should be used everywhere)
VERTEX_AI_LOCATION=us-central1               # ← REDUNDANT (use VERTEX_EMBEDDING_LOCATION)
VERTEX_AI_MODEL=gemini-2.5-flash
```

### Issues Identified

#### Issue 1: GOOGLE_API_KEY (Legacy)
- **Status**: Deprecated but still referenced
- **Usage**: Legacy `EmbeddingsService` (not used in production)
- **References**: 47 in code, 58+ in docs
- **Action**: Complete removal

#### Issue 2: Duplicate Project Variables
- `VERTEX_EMBEDDING_PROJECT` (embeddings)
- `GCP_PROJECT_ID` (LLM/chat)
- **Should be**: Single `GCP_PROJECT_ID` for all Google Cloud services

#### Issue 3: Duplicate Location Variables
- `VERTEX_EMBEDDING_LOCATION` (embeddings)
- `VERTEX_AI_LOCATION` (LLM/chat)
- **Should be**: Single `VERTEX_AI_LOCATION` for consistency

#### Issue 4: Two Embedding Systems
- **Legacy**: `EmbeddingsService` (uses GOOGLE_API_KEY)
- **Production**: `GoogleVertexEmbeddingProvider` (uses Vertex AI)
- **Used by**: 4 services still inject legacy `EmbeddingsService`

---

## Proposed Consolidated Configuration

### Final Environment Variables

```bash
# ============================================================================
# Google Cloud / Vertex AI Configuration (Unified)
# ============================================================================

# GCP Project (used by all Google Cloud services)
GCP_PROJECT_ID=your-gcp-project

# Vertex AI Location (used by all Vertex AI services)
VERTEX_AI_LOCATION=us-central1

# Embedding Configuration
EMBEDDING_PROVIDER=vertex                    # vertex | google | dummy
VERTEX_EMBEDDING_MODEL=text-embedding-004    # Default: text-embedding-004

# LLM/Chat Configuration
VERTEX_AI_MODEL=gemini-2.5-flash            # Default: gemini-2.5-flash
CHAT_MODEL_ENABLED=true                      # Enable real LLM (requires GCP_PROJECT_ID)

# Feature Flags
EMBEDDINGS_NETWORK_DISABLED=false            # Force offline/dummy mode
EXTRACTION_WORKER_ENABLED=true               # Enable background extraction
```

### Variable Consolidation

| Old (Remove) | New (Keep) | Purpose |
|--------------|------------|---------|
| `GOOGLE_API_KEY` | ❌ Delete | Legacy API key auth (deprecated) |
| `VERTEX_EMBEDDING_PROJECT` | Use `GCP_PROJECT_ID` | GCP project for embeddings |
| `VERTEX_AI_PROJECT_ID` | Use `GCP_PROJECT_ID` | GCP project for LLM (redundant) |
| `VERTEX_EMBEDDING_LOCATION` | Use `VERTEX_AI_LOCATION` | Vertex AI region |

**Result**: 
- 4 variables removed
- Single `GCP_PROJECT_ID` for all services
- Single `VERTEX_AI_LOCATION` for all services
- Clearer, more maintainable configuration

---

## Implementation Plan

### Phase 1: Remove Legacy EmbeddingsService (HIGH PRIORITY)

**Estimated**: 4-6 hours

#### Task 1.1: Audit Current Usage

Verify which services actually use the legacy `EmbeddingsService`:

**Files to check**:
1. `modules/ingestion/ingestion.service.ts`
2. `modules/chat/chat.service.ts`
3. `modules/search/search.service.ts`
4. `modules/extraction-jobs/entity-linking.service.ts`

**Analysis needed**:
- Do they call `embeddings.embedQuery()` or `embeddings.embedDocuments()`?
- Can they use `GoogleVertexEmbeddingProvider` instead?
- Are there any special use cases?

#### Task 1.2: Create Migration Strategy

**Option A: Direct Injection**
- Inject `GoogleVertexEmbeddingProvider` directly
- Update service constructors
- Update method calls

**Option B: Create Abstraction**
- Keep `EmbeddingsService` as interface/abstraction
- Implementation delegates to `GoogleVertexEmbeddingProvider`
- Less breaking changes

**Recommendation**: Option A (cleaner, removes layer)

#### Task 1.3: Migrate Services (4 files)

**For each service**:

```typescript
// OLD
import { EmbeddingsService } from '../embeddings/embeddings.service';

constructor(
  private readonly embeddings: EmbeddingsService,
) {}

// NEW
import { GoogleVertexEmbeddingProvider } from '../graph/google-vertex-embedding.provider';

constructor(
  private readonly embeddingProvider: GoogleVertexEmbeddingProvider,
) {}

// Update method calls
const embedding = await this.embeddings.embedQuery(text);
// TO
const embeddingBuffer = await this.embeddingProvider.generate(text);
const embedding = Array.from(new Float32Array(embeddingBuffer.buffer));
```

**Files to update**:
1. `modules/ingestion/ingestion.service.ts`
2. `modules/chat/chat.service.ts`
3. `modules/search/search.service.ts`
4. `modules/extraction-jobs/entity-linking.service.ts`

**Module imports to update**:
- `modules/ingestion/ingestion.module.ts`
- `modules/chat/chat.module.ts`
- `modules/search/search.module.ts`
- `modules/extraction-jobs/extraction-jobs.module.ts`

#### Task 1.4: Delete Legacy Module

**Files to delete**:
```bash
rm apps/server-nest/src/modules/embeddings/embeddings.service.ts
rm apps/server-nest/src/modules/embeddings/embeddings.module.ts
rmdir apps/server-nest/src/modules/embeddings/
```

**Dependency to remove** (check package.json):
```bash
# If only used by EmbeddingsService:
npm uninstall @langchain/google-genai
```

---

### Phase 2: Consolidate Vertex AI Variables (HIGH PRIORITY)

**Estimated**: 2-3 hours

#### Task 2.1: Update GoogleVertexEmbeddingProvider

**File**: `apps/server-nest/src/modules/graph/google-vertex-embedding.provider.ts`

**Current**:
```typescript
const projectId = process.env.VERTEX_EMBEDDING_PROJECT;
const location = process.env.VERTEX_EMBEDDING_LOCATION || 'us-central1';
const model = process.env.VERTEX_EMBEDDING_MODEL || 'text-embedding-004';
```

**Change to**:
```typescript
const projectId = process.env.GCP_PROJECT_ID;
const location = process.env.VERTEX_AI_LOCATION || 'us-central1';
const model = process.env.VERTEX_EMBEDDING_MODEL || 'text-embedding-004';
```

**Update error messages**:
```typescript
this.logger.warn('Vertex AI Embeddings not configured: GCP_PROJECT_ID missing');
```

#### Task 2.2: Update LLM Providers

**Files to check**:
- `modules/extraction-jobs/llm/vertex-ai.provider.ts`
- `modules/extraction-jobs/llm/langchain-gemini.provider.ts`
- `modules/discovery-jobs/discovery-llm.provider.ts`

**Verify they use**:
- `GCP_PROJECT_ID` (not VERTEX_AI_PROJECT_ID)
- `VERTEX_AI_LOCATION` (consistent)
- `VERTEX_AI_MODEL` (consistent)

#### Task 2.3: Update Config Schema

**File**: `apps/server-nest/src/common/config/config.schema.ts`

**Check if these exist** (if so, remove):
```typescript
VERTEX_AI_PROJECT_ID?: string;  // ← DELETE (use GCP_PROJECT_ID)
VERTEX_EMBEDDING_PROJECT?: string;  // ← DELETE (use GCP_PROJECT_ID)
VERTEX_EMBEDDING_LOCATION?: string;  // ← DELETE (use VERTEX_AI_LOCATION)
```

**Keep only**:
```typescript
GCP_PROJECT_ID?: string;           // Used by all Google Cloud services
VERTEX_AI_LOCATION?: string;       // Used by all Vertex AI services
VERTEX_AI_MODEL?: string;          // LLM model
VERTEX_EMBEDDING_MODEL?: string;   // Embedding model (if different from LLM)
```

---

### Phase 3: Update Environment Files (HIGH PRIORITY)

**Estimated**: 30 minutes

#### Task 3.1: Update .env.example

**Remove**:
```bash
GOOGLE_API_KEY=
VERTEX_EMBEDDING_PROJECT=
VERTEX_AI_PROJECT_ID=
```

**Add/Update**:
```bash
# ============================================================================
# Google Cloud / Vertex AI Configuration
# ============================================================================
# All Google Cloud services use a single GCP_PROJECT_ID

# GCP Project (required for all Vertex AI services)
GCP_PROJECT_ID=your-gcp-project-id

# Vertex AI Configuration
VERTEX_AI_LOCATION=us-central1
VERTEX_AI_MODEL=gemini-2.5-flash

# Embedding Configuration
EMBEDDING_PROVIDER=vertex
VERTEX_EMBEDDING_MODEL=text-embedding-004

# Feature Flags
EMBEDDINGS_NETWORK_DISABLED=false
CHAT_MODEL_ENABLED=true
EXTRACTION_WORKER_ENABLED=true

# ============================================================================
# Authentication
# ============================================================================
# Vertex AI uses Application Default Credentials (ADC)
# Run: gcloud auth application-default login
# Or set: GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

#### Task 3.2: Update .env.production.example

**Remove**:
```bash
GOOGLE_API_KEY=<your-google-api-key>
```

**Keep/Update**:
```bash
# Google Cloud Configuration
GCP_PROJECT_ID=<your-gcp-project>
VERTEX_AI_LOCATION=us-central1
VERTEX_AI_MODEL=gemini-2.5-flash

# Embedding Configuration
EMBEDDING_PROVIDER=vertex
VERTEX_EMBEDDING_MODEL=text-embedding-004
```

#### Task 3.3: Update Local .env File

**Current** (your .env):
```bash
EMBEDDING_PROVIDER=vertex
VERTEX_EMBEDDING_PROJECT=twentyfirst-io      # ← REMOVE
VERTEX_EMBEDDING_LOCATION=europe-north1      # ← RENAME to VERTEX_AI_LOCATION
GCP_PROJECT_ID=spec-server-dev               # ← KEEP (and use everywhere)
VERTEX_AI_LOCATION=us-central1               # ← CONFLICT! Resolve
VERTEX_AI_MODEL=gemini-2.5-flash
```

**Action needed**:
1. Remove `VERTEX_EMBEDDING_PROJECT`
2. Decide on single location (europe-north1 or us-central1)
3. Use only `VERTEX_AI_LOCATION`

---

### Phase 4: Update Tests (MEDIUM PRIORITY)

**Estimated**: 2-3 hours

#### Task 4.1: Update Test Environment Setup

**Files to update**:
- `apps/server-nest/tests/scenarios/helpers/load-env.ts`
- `apps/server-nest/tests/scenarios/setup-chat-debug.ts`

**Change from**:
```typescript
GOOGLE_API_KEY: !!process.env.GOOGLE_API_KEY,
```

**Change to**:
```typescript
GCP_PROJECT_ID: !!process.env.GCP_PROJECT_ID,
VERTEX_AI_CONFIGURED: !!process.env.GCP_PROJECT_ID && !!process.env.VERTEX_AI_LOCATION,
```

#### Task 4.2: Update Test Skip Conditions

**Pattern to find**:
```typescript
if (!process.env.GOOGLE_API_KEY) {
    console.warn('Skipped - GOOGLE_API_KEY not set');
    return;
}
```

**Replace with**:
```typescript
if (!process.env.GCP_PROJECT_ID) {
    console.warn('Skipped - GCP_PROJECT_ID not set');
    return;
}
```

**Files to update** (~10 files):
- `tests/e2e/extraction.entity-linking.e2e.spec.ts`
- `tests/scenarios/user-first-run.spec.ts`
- `tests/unit/embeddings.service.spec.ts`
- `tests/embeddings.service.real.spec.ts`
- Various test helpers and setup files

#### Task 4.3: Update Test Mocking

**Files with GOOGLE_API_KEY test setup**:
```typescript
// OLD
process.env.GOOGLE_API_KEY = 'fake-key';
delete process.env.GOOGLE_API_KEY;

// NEW
process.env.GCP_PROJECT_ID = 'test-project';
delete process.env.GCP_PROJECT_ID;
```

**Files to update**:
- `__tests__/embedding-worker.spec.ts`
- `__tests__/embedding-worker.backoff.spec.ts`
- `__tests__/graph-embedding.enqueue.spec.ts`
- `__tests__/embedding-provider.vertex.spec.ts`
- `__tests__/embedding-provider.selection.spec.ts`

---

### Phase 5: Update Documentation (MEDIUM PRIORITY)

**Estimated**: 2-3 hours

#### Task 5.1: Update Core Documentation

**Files to update**:

1. **README.md**
   - Remove: "GOOGLE_API_KEY - AI services (embeddings, chat)"
   - Add: "GCP_PROJECT_ID - All Google Cloud services"

2. **RUNBOOK.md**
   - Remove: "GOOGLE_API_KEY (required)"
   - Add: Vertex AI authentication section

3. **SETUP.md**
   - Remove: GOOGLE_API_KEY setup instructions
   - Add: Vertex AI ADC setup instructions

4. **COOLIFY_DEPLOYMENT_READY.md**
   - Remove: GOOGLE_API_KEY from examples
   - Update: Use GCP_PROJECT_ID only

5. **docs/COOLIFY_DEPLOYMENT_PLAN.md**
   - Remove: GOOGLE_API_KEY from env var lists
   - Update: Vertex AI configuration section

#### Task 5.2: Update Spec Documents

**Files in docs/spec/**:
- `20-embeddings.md` - Update configuration examples
- `25-extraction-worker.md` - Remove GOOGLE_API_KEY
- `32-extraction-worker-phase3-task4-vector-similarity.md` - Update config
- `33-extraction-worker-phase3-task5-integration-tests.md` - Update setup

#### Task 5.3: Update Setup Guides

**Files in docs/setup/**:
- `EXTRACTION_WORKER_SETUP.md` - Replace GOOGLE_API_KEY with Vertex AI
- `VERTEX_AI_CHAT_CONFIGURATION.md` - Remove GOOGLE_API_KEY fallback

#### Task 5.4: Add Deprecation Notice

Create section in README.md and CHANGELOG.md:

```markdown
## ⚠️ GOOGLE_API_KEY Removed (v2.1.0)

The legacy `GOOGLE_API_KEY` environment variable has been removed.

**Migration**:
- Remove `GOOGLE_API_KEY` from your `.env`
- Configure Vertex AI instead (see Configuration section)
- Authenticate: `gcloud auth application-default login`

**Vertex AI Configuration**:
```bash
GCP_PROJECT_ID=your-gcp-project
VERTEX_AI_LOCATION=us-central1
EMBEDDING_PROVIDER=vertex
```
```

---

## Detailed Task Breakdown

### Task Group A: Code Changes (6-8 hours)

#### A1: Remove EmbeddingsService (2 hours)

**Steps**:
1. Audit usage in 4 services
2. Migrate each service to use `GoogleVertexEmbeddingProvider`
3. Update module imports
4. Delete `embeddings/` directory
5. Update package.json (remove `@langchain/google-genai` if unused elsewhere)
6. Run tests

**Services to migrate**:
```typescript
// In each service file:

// BEFORE
import { EmbeddingsService } from '../embeddings/embeddings.service';
private readonly embeddings: EmbeddingsService

// AFTER
import { GoogleVertexEmbeddingProvider } from '../graph/google-vertex-embedding.provider';
private readonly embeddingProvider: GoogleVertexEmbeddingProvider

// Method call changes:
const vec = await this.embeddings.embedQuery(text);
// TO
const buffer = await this.embeddingProvider.generate(text);
const vec = Array.from(new Float32Array(buffer.buffer));
```

**Files**:
1. ✅ `modules/ingestion/ingestion.service.ts` + `ingestion.module.ts`
2. ✅ `modules/chat/chat.service.ts` + `chat.module.ts`
3. ✅ `modules/search/search.service.ts` + `search.module.ts`
4. ✅ `modules/extraction-jobs/entity-linking.service.ts` + module

#### A2: Consolidate Vertex AI Variables (2 hours)

**Step 1: Update GoogleVertexEmbeddingProvider**

**File**: `modules/graph/google-vertex-embedding.provider.ts`

```typescript
// BEFORE
const projectId = process.env.VERTEX_EMBEDDING_PROJECT;
const location = process.env.VERTEX_EMBEDDING_LOCATION || 'us-central1';

// AFTER
const projectId = process.env.GCP_PROJECT_ID;
const location = process.env.VERTEX_AI_LOCATION || 'us-central1';

// Update error message
this.logger.warn('Vertex AI Embeddings not configured: GCP_PROJECT_ID missing');
```

**Step 2: Update Config Schema** (if needed)

**File**: `apps/server-nest/src/common/config/config.schema.ts`

Remove any references to:
- `VERTEX_EMBEDDING_PROJECT`
- `VERTEX_AI_PROJECT_ID`
- `VERTEX_EMBEDDING_LOCATION`

Keep only:
- `GCP_PROJECT_ID`
- `VERTEX_AI_LOCATION`
- `VERTEX_AI_MODEL`
- `VERTEX_EMBEDDING_MODEL` (optional, for different model)

**Step 3: Update All Service References**

Search and replace in all provider files:
```typescript
VERTEX_EMBEDDING_PROJECT → GCP_PROJECT_ID
VERTEX_EMBEDDING_LOCATION → VERTEX_AI_LOCATION
VERTEX_AI_PROJECT_ID → GCP_PROJECT_ID
```

#### A3: Update LLM Provider Warnings (30 min)

**File**: `modules/extraction-jobs/llm/llm-provider.factory.ts`

**Current**:
```typescript
this.logger.warn('No LLM provider configured. Set GCP_PROJECT_ID or GOOGLE_API_KEY');
```

**Change to**:
```typescript
this.logger.warn('No LLM provider configured. Set GCP_PROJECT_ID and VERTEX_AI_LOCATION');
```

---

### Task Group B: Environment & Config (1-2 hours)

#### B1: Update .env.example (15 min)

**Remove**:
- `GOOGLE_API_KEY=`
- `VERTEX_EMBEDDING_PROJECT=`
- `VERTEX_AI_PROJECT_ID=`
- `VERTEX_EMBEDDING_LOCATION=`

**Keep/Add**:
```bash
# Google Cloud Project (used by all GCP services)
GCP_PROJECT_ID=your-gcp-project-id

# Vertex AI Configuration
VERTEX_AI_LOCATION=us-central1
VERTEX_AI_MODEL=gemini-2.5-flash
VERTEX_EMBEDDING_MODEL=text-embedding-004

# Embedding Configuration
EMBEDDING_PROVIDER=vertex
EMBEDDINGS_NETWORK_DISABLED=false

# Chat Configuration
CHAT_MODEL_ENABLED=true
```

#### B2: Update .env.production.example (15 min)

Same changes as .env.example

#### B3: Update Local .env File (5 min)

**Current**:
```bash
VERTEX_EMBEDDING_PROJECT=twentyfirst-io
VERTEX_EMBEDDING_LOCATION=europe-north1
GCP_PROJECT_ID=spec-server-dev
VERTEX_AI_LOCATION=us-central1
```

**Change to** (choose one location):
```bash
GCP_PROJECT_ID=twentyfirst-io         # Use the actual project ID
VERTEX_AI_LOCATION=europe-north1      # Or us-central1 - pick one!
VERTEX_AI_MODEL=gemini-2.5-flash
VERTEX_EMBEDDING_MODEL=text-embedding-004
EMBEDDING_PROVIDER=vertex
```

#### B4: Update docker-compose.yml (15 min)

**Remove from server environment**:
- `GOOGLE_API_KEY`
- `VERTEX_EMBEDDING_PROJECT`
- `VERTEX_AI_PROJECT_ID`

**Keep**:
- `GCP_PROJECT_ID`
- `VERTEX_AI_LOCATION`
- `VERTEX_AI_MODEL`
- `EMBEDDING_PROVIDER`

---

### Task Group C: Test Updates (2-3 hours)

#### C1: Update Test Environment Setup (1 hour)

**Files**:
- `tests/scenarios/helpers/load-env.ts`
- `tests/scenarios/setup-chat-debug.ts`
- `test/README-LANGCHAIN-E2E.md`

**Replace**:
```typescript
GOOGLE_API_KEY: !!process.env.GOOGLE_API_KEY
```

**With**:
```typescript
GCP_PROJECT_ID: !!process.env.GCP_PROJECT_ID
VERTEX_AI_CONFIGURED: !!process.env.GCP_PROJECT_ID && !!process.env.VERTEX_AI_LOCATION
```

#### C2: Update Test Skip Logic (1 hour)

**Pattern**:
```typescript
// BEFORE
const hasKey = !!process.env.GOOGLE_API_KEY;
if (!hasKey) {
    console.warn('Skipped - set GOOGLE_API_KEY to run');
    return;
}

// AFTER
const hasVertexAI = !!process.env.GCP_PROJECT_ID;
if (!hasVertexAI) {
    console.warn('Skipped - set GCP_PROJECT_ID to run');
    return;
}
```

**Files** (~10 files):
- All extraction E2E tests
- Embedding tests
- Scenario tests
- Integration tests

#### C3: Update Test Mocking (1 hour)

**Pattern**:
```typescript
// BEFORE
process.env.GOOGLE_API_KEY = 'test-key';
delete process.env.GOOGLE_API_KEY;

// AFTER
process.env.GCP_PROJECT_ID = 'test-project';
process.env.VERTEX_AI_LOCATION = 'us-central1';
delete process.env.GCP_PROJECT_ID;
```

**Files**:
- `__tests__/embedding-worker.spec.ts`
- `__tests__/graph-embedding.enqueue.spec.ts`
- `__tests__/embedding-provider.*.spec.ts`
- Unit tests for embeddings service

---

### Task Group D: Documentation Updates (2-3 hours)

#### D1: Update Primary Documentation (1 hour)

1. **README.md**
   - Remove GOOGLE_API_KEY from configuration section
   - Add Vertex AI authentication instructions
   - Update examples

2. **RUNBOOK.md**
   - Remove GOOGLE_API_KEY references
   - Add ADC authentication section
   - Update troubleshooting

3. **SETUP.md**
   - Remove GOOGLE_API_KEY setup
   - Add Vertex AI setup instructions
   - Add ADC authentication guide

#### D2: Update Deployment Documentation (1 hour)

1. **COOLIFY_DEPLOYMENT_READY.md**
   - Remove GOOGLE_API_KEY from environment section
   - Update with consolidated Vertex AI config
   - Update secrets list

2. **docs/COOLIFY_DEPLOYMENT_PLAN.md**
   - Remove GOOGLE_API_KEY references
   - Update environment variable list
   - Update configuration examples

#### D3: Update Spec Documents (1 hour)

**Files to update** (mark as legacy or update):
- `docs/spec/20-embeddings.md`
- `docs/spec/25-extraction-worker.md`
- `docs/spec/32-extraction-worker-phase3-task4-vector-similarity.md`
- `docs/spec/33-extraction-worker-phase3-task5-integration-tests.md`

**Options**:
- Add "DEPRECATED" notice at top
- Update to use Vertex AI
- Move to docs/archive/

#### D4: Create Migration Notice

**File**: `docs/VERTEX_AI_MIGRATION.md`

```markdown
# Google API Key → Vertex AI Migration

**Date**: October 31, 2025  
**Status**: Complete

## Summary

Removed legacy `GOOGLE_API_KEY` support and consolidated Vertex AI configuration.

## Changes

### Environment Variables Removed
- `GOOGLE_API_KEY` (legacy API key authentication)
- `VERTEX_EMBEDDING_PROJECT` (duplicate of GCP_PROJECT_ID)
- `VERTEX_AI_PROJECT_ID` (duplicate of GCP_PROJECT_ID)
- `VERTEX_EMBEDDING_LOCATION` (duplicate of VERTEX_AI_LOCATION)

### Environment Variables Consolidated

**Single GCP Project**:
```bash
GCP_PROJECT_ID=your-gcp-project  # Used by ALL Google Cloud services
```

**Single Location**:
```bash
VERTEX_AI_LOCATION=us-central1   # Used by ALL Vertex AI services
```

## Migration Steps

1. Remove from .env:
   - GOOGLE_API_KEY
   - VERTEX_EMBEDDING_PROJECT
   - VERTEX_AI_PROJECT_ID
   - VERTEX_EMBEDDING_LOCATION

2. Keep/Add to .env:
   - GCP_PROJECT_ID (your GCP project)
   - VERTEX_AI_LOCATION (single location for all services)

3. Authenticate with ADC:
   ```bash
   gcloud auth application-default login
   ```

## Authentication

**Before** (API Key):
```bash
GOOGLE_API_KEY=AIzaSyA5qbg...
```

**After** (Application Default Credentials):
```bash
# Authenticate once
gcloud auth application-default login

# Or use service account
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

## Benefits

✅ Single authentication mechanism (ADC)  
✅ Production-ready security (no API keys in env)  
✅ Unified configuration (one project ID)  
✅ Cleaner codebase (removed legacy service)  
✅ Less configuration needed
```

---

## Breaking Changes Summary

### BREAKING CHANGE 1: GOOGLE_API_KEY Removed

**Impact**: HIGH  
**Effort**: 6-8 hours  

**Changes**:
- Remove `EmbeddingsService` module
- Migrate 4 services to Vertex AI provider
- Update all tests
- Update all documentation
- Remove from environment files

**Migration**:
- Remove GOOGLE_API_KEY from .env
- Already using Vertex AI in production ✅

### BREAKING CHANGE 2: Vertex AI Variables Consolidated

**Impact**: MEDIUM  
**Effort**: 2-3 hours

**Changes**:
- `VERTEX_EMBEDDING_PROJECT` → Use `GCP_PROJECT_ID`
- `VERTEX_AI_PROJECT_ID` → Use `GCP_PROJECT_ID`
- `VERTEX_EMBEDDING_LOCATION` → Use `VERTEX_AI_LOCATION`

**Migration**:
```bash
# BEFORE
VERTEX_EMBEDDING_PROJECT=twentyfirst-io
VERTEX_EMBEDDING_LOCATION=europe-north1
GCP_PROJECT_ID=spec-server-dev
VERTEX_AI_LOCATION=us-central1

# AFTER (consolidated)
GCP_PROJECT_ID=twentyfirst-io
VERTEX_AI_LOCATION=europe-north1
```

---

## Implementation Checklist

### Phase 1: Remove Legacy EmbeddingsService ✅
- [ ] Audit IngestionService usage
- [ ] Audit ChatService usage
- [ ] Audit SearchService usage
- [ ] Audit EntityLinkingService usage
- [ ] Migrate IngestionService to Vertex AI provider
- [ ] Migrate ChatService to Vertex AI provider
- [ ] Migrate SearchService to Vertex AI provider
- [ ] Migrate EntityLinkingService to Vertex AI provider
- [ ] Update module imports (4 modules)
- [ ] Delete embeddings/embeddings.service.ts
- [ ] Delete embeddings/embeddings.module.ts
- [ ] Remove directory if empty
- [ ] Remove @langchain/google-genai if unused

### Phase 2: Consolidate Vertex AI Variables ✅
- [ ] Update GoogleVertexEmbeddingProvider (use GCP_PROJECT_ID)
- [ ] Update VertexAIProvider (verify uses GCP_PROJECT_ID)
- [ ] Update LangChainGeminiProvider (verify uses GCP_PROJECT_ID)
- [ ] Update DiscoveryLLMProvider (verify uses GCP_PROJECT_ID)
- [ ] Update config.schema.ts (remove duplicate variables)
- [ ] Update all error messages
- [ ] Search for VERTEX_EMBEDDING_PROJECT usage
- [ ] Search for VERTEX_AI_PROJECT_ID usage
- [ ] Replace all with GCP_PROJECT_ID

### Phase 3: Update Environment Files ✅
- [ ] Update .env.example (remove GOOGLE_API_KEY)
- [ ] Update .env.production.example (remove GOOGLE_API_KEY)
- [ ] Update local .env (consolidate variables)
- [ ] Update docker-compose.yml server environment
- [ ] Resolve location conflict (choose one)

### Phase 4: Update Tests ✅
- [ ] Update test environment setup (2 files)
- [ ] Update skip conditions (~10 files)
- [ ] Update test mocking (~6 files)
- [ ] Update E2E test setup
- [ ] Run full test suite
- [ ] Fix any broken tests

### Phase 5: Update Documentation ✅
- [ ] Update README.md
- [ ] Update RUNBOOK.md
- [ ] Update SETUP.md
- [ ] Update COOLIFY_DEPLOYMENT_READY.md
- [ ] Update COOLIFY_DEPLOYMENT_PLAN.md
- [ ] Update spec documents (4 files)
- [ ] Update setup guides (2 files)
- [ ] Create VERTEX_AI_MIGRATION.md
- [ ] Update CHANGELOG.md

---

## Risk Assessment

### High Risk

1. **EmbeddingsService Migration**
   - Risk: Services may have different interfaces
   - Mitigation: Careful audit, comprehensive testing
   - Rollback: Revert commits, restore module

2. **Test Breakage**
   - Risk: Many tests reference GOOGLE_API_KEY
   - Mitigation: Update incrementally, run tests frequently
   - Rollback: Revert test changes

### Medium Risk

3. **Configuration Mismatch**
   - Risk: Different services use different project IDs
   - Mitigation: Verify all use GCP_PROJECT_ID consistently
   - Rollback: Easy - just update env vars

4. **Documentation Drift**
   - Risk: Miss some GOOGLE_API_KEY references
   - Mitigation: Comprehensive grep search
   - Impact: Low - just confusing docs

### Low Risk

5. **Production Impact**
   - Risk: Very low - already using Vertex AI
   - Current .env: Already correct configuration
   - Migration: Just remove unused variables

---

## Timeline Estimate

| Phase | Tasks | Duration | Priority |
|-------|-------|----------|----------|
| Phase 1: Remove EmbeddingsService | 8 tasks | 4-6 hours | HIGH |
| Phase 2: Consolidate Variables | 9 tasks | 2-3 hours | HIGH |
| Phase 3: Environment Files | 5 tasks | 1 hour | HIGH |
| Phase 4: Update Tests | 5 tasks | 2-3 hours | MEDIUM |
| Phase 5: Documentation | 9 tasks | 2-3 hours | MEDIUM |
| **Total** | **36 tasks** | **11-16 hours** | **2 days** |

**Buffer**: +4 hours for unexpected issues  
**Total with buffer**: **15-20 hours (~2.5 days)**

---

## Success Criteria

### Code
- [ ] No references to GOOGLE_API_KEY in src/
- [ ] Single GCP_PROJECT_ID used everywhere
- [ ] Single VERTEX_AI_LOCATION used everywhere
- [ ] EmbeddingsService module deleted
- [ ] All services use Vertex AI providers
- [ ] All tests pass

### Configuration
- [ ] .env uses only consolidated variables
- [ ] .env.example updated
- [ ] .env.production.example updated
- [ ] docker-compose.yml cleaned up
- [ ] No duplicate/redundant variables

### Documentation
- [ ] All docs updated to Vertex AI
- [ ] Migration guide created
- [ ] CHANGELOG.md updated
- [ ] README.md updated
- [ ] No confusing GOOGLE_API_KEY references

### Testing
- [ ] Unit tests pass
- [ ] E2E tests pass
- [ ] Integration tests pass
- [ ] Local dev works
- [ ] Production config validated

---

## Current Configuration (Your .env)

### Issues to Resolve

```bash
# ❌ ISSUE 1: Duplicate project IDs
VERTEX_EMBEDDING_PROJECT=twentyfirst-io      # Should be removed
GCP_PROJECT_ID=spec-server-dev               # Keep, but which value?

# ❌ ISSUE 2: Conflicting locations
VERTEX_EMBEDDING_LOCATION=europe-north1      # Should be removed
VERTEX_AI_LOCATION=us-central1               # Keep, but which value?

# ❌ ISSUE 3: Missing variable
VERTEX_AI_PROJECT_ID=spec-server-dev         # Duplicate, should use GCP_PROJECT_ID

# ✅ CORRECT
EMBEDDING_PROVIDER=vertex
VERTEX_EMBEDDING_MODEL=text-embedding-004
VERTEX_AI_MODEL=gemini-2.5-flash
```

### Recommended Final Config

**Question to resolve**: Which project and location?
- Project: `twentyfirst-io` or `spec-server-dev`?
- Location: `europe-north1` or `us-central1`?

**Recommended .env**:
```bash
# Google Cloud Configuration (choose your values)
GCP_PROJECT_ID=twentyfirst-io               # Your actual GCP project
VERTEX_AI_LOCATION=europe-north1            # Your preferred region

# Model Configuration
VERTEX_AI_MODEL=gemini-2.5-flash           # LLM model
VERTEX_EMBEDDING_MODEL=text-embedding-004   # Embedding model

# Feature Configuration
EMBEDDING_PROVIDER=vertex
CHAT_MODEL_ENABLED=true
EMBEDDINGS_NETWORK_DISABLED=false
EXTRACTION_WORKER_ENABLED=true
```

---

## Pre-Implementation Questions

1. **Which GCP project should be used?**
   - `twentyfirst-io` (from VERTEX_EMBEDDING_PROJECT)
   - `spec-server-dev` (from GCP_PROJECT_ID)
   
2. **Which region should be used?**
   - `europe-north1` (from VERTEX_EMBEDDING_LOCATION)
   - `us-central1` (from VERTEX_AI_LOCATION)

3. **Should we keep separate embedding model config?**
   - Yes: `VERTEX_EMBEDDING_MODEL` (if different from VERTEX_AI_MODEL)
   - No: Use same model for both embeddings and LLM

4. **Timeline preference?**
   - Do all at once (2-3 day effort)
   - Split into smaller PRs (longer, safer)

---

## Next Steps

1. **Decide**: Answer the 4 questions above
2. **Review**: This plan with team
3. **Schedule**: Block 2-3 days for implementation
4. **Communicate**: Notify team of breaking changes
5. **Execute**: Follow implementation plan
6. **Test**: Comprehensive testing at each phase
7. **Document**: Update all docs
8. **Deploy**: Update Coolify environment variables

---

**Recommendation**: Proceed with complete cleanup for long-term maintainability.

Your production setup is already correct - this is mostly removing legacy code and documentation cleanup.
