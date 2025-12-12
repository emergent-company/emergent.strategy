# Extraction Tests

This folder contains test scripts for the LLM entity extraction pipeline. These scripts test different extraction methods, configurations, and can be used for benchmarking and debugging.

## Directory Structure

```
extraction_tests/
├── lib/                    # Shared library
│   ├── index.ts           # Barrel export
│   ├── config.ts          # Shared configuration
│   ├── types.ts           # TypeScript types
│   ├── model.ts           # Model initialization
│   ├── prompts.ts         # Prompts and schemas
│   ├── stats.ts           # Statistics utilities
│   ├── logger.ts          # Pretty printing
│   ├── runner.ts          # Test runner with multi-run averaging
│   ├── tracing.ts         # Langfuse tracing utilities
│   └── verification/      # 3-tier verification cascade
│       ├── index.ts       # Main exports
│       ├── types.ts       # Type definitions
│       ├── exact-match.ts # Tier 1: Levenshtein fuzzy match
│       ├── nli-verifier.ts # Tier 2: NLI semantic entailment
│       ├── llm-judge.ts   # Tier 3: LLM-based verification
│       └── cascade.ts     # Cascade orchestrator
├── tests/                  # Refactored test scripts
│   ├── json-prompting.test.ts    # JSON prompting method
│   ├── function-calling.test.ts  # Function calling method
│   └── verification/             # Verification tests
│       ├── exact-match.test.ts   # Tier 1 tests
│       └── cascade.test.ts       # Full cascade tests
├── run-all.ts             # Unified test runner
├── README.md              # This file
└── *.ts                   # Legacy test scripts (see below)
```

## Quick Start

### Run All Tests (Recommended)

```bash
# Default: 3 runs per test with 1 warmup run
npx tsx scripts/extraction_tests/run-all.ts

# Custom number of runs
npx tsx scripts/extraction_tests/run-all.ts --runs=5

# Skip warmup runs
npx tsx scripts/extraction_tests/run-all.ts --no-warmup
```

### Run Individual Tests

```bash
# JSON prompting (most reliable)
npx tsx scripts/extraction_tests/tests/json-prompting.test.ts

# Function calling
npx tsx scripts/extraction_tests/tests/function-calling.test.ts

# With custom runs
npx tsx scripts/extraction_tests/tests/json-prompting.test.ts --runs=5
```

## Configuration

All scripts use shared configuration from `lib/config.ts`:

| Setting          | Value                                           |
| ---------------- | ----------------------------------------------- |
| **Model**        | `gemini-2.5-flash-lite`                         |
| **Project**      | `spec-server-dev`                               |
| **Location**     | `europe-central2`                               |
| **Credentials**  | `spec-server-dev-vertex-ai.json` (project root) |
| **Temperature**  | 0.1                                             |
| **Timeout**      | 60s default, 120s max                           |
| **Default Runs** | 3 per test                                      |
| **Warmup Runs**  | 1 before measuring                              |

## Test Methods

### JSON Prompting (`json_prompting`)

Uses `responseMimeType: 'application/json'` for reliable extraction.

**Pros:**

- Most reliable method
- Works even when structured output fails
- Fast (~750ms average)

**Cons:**

- Manual JSON parsing required
- Schema not enforced by model

### Function Calling (`function_calling`)

Uses `withStructuredOutput()` with `method: 'function_calling'`.

**Pros:**

- Schema validation by model
- Cleaner integration with LangChain

**Cons:**

- Intermittent Vertex AI API issues
- Less reliable than JSON prompting

## Shared Library Usage

```typescript
import {
  // Configuration
  CONFIG,

  // Model creation
  createJsonModel,
  createTextModel,
  invokeWithTimeout,

  // Prompts
  TEST_DOCUMENTS,
  JSON_SCHEMAS,
  ZOD_SCHEMAS,
  ENTITY_TYPES,
  createJsonExtractionPrompt,

  // Test runner
  runTests,
  createTest,
  parseRunsFromArgs,

  // Logging
  logger,

  // Statistics
  mean,
  stdDev,
  createSummary,
} from './lib/index.js';
```

### Creating a New Test

```typescript
import { createTest, runTest, logger, createTimer } from './lib/index.js';
import type { ExtractionResult } from './lib/index.js';

async function myExtraction(): Promise<ExtractionResult> {
  const timer = createTimer();

  try {
    // Your extraction logic here
    return {
      success: true,
      entities: [...],
      durationMs: timer.stop(),
    };
  } catch (err) {
    return {
      success: false,
      entities: [],
      durationMs: timer.stop(),
      error: err.message,
    };
  }
}

const test = createTest(
  'my-test-name',
  'Description of what this test does',
  'json_prompting', // or 'function_calling' or 'structured_output'
  myExtraction
);

const summary = await runTest(test, { runs: 3 });
logger.summary(summary);
```

## Legacy Test Scripts

The following scripts are from before the refactoring. They still work but don't use the shared library:

| Script                                | Method               | Status            | Use Case                  |
| ------------------------------------- | -------------------- | ----------------- | ------------------------- |
| `test-extraction-fixed.ts`            | JSON Prompting       | **Working**       | Baseline/debugging        |
| `test-simplified-extraction.ts`       | Function Calling     | _API Issues_      | Simplified prompt testing |
| `test-extraction-pipeline.ts`         | Function Calling     | _API Issues_      | Full pipeline testing     |
| `test-extraction.ts`                  | withStructuredOutput | _API Issues_      | Multi-type extraction     |
| `test-extraction-job.ts`              | withStructuredOutput | _API Issues_      | Job simulation            |
| `test-langfuse-extraction.ts`         | NestJS + Langfuse    | Requires server   | Tracing tests             |
| `test-langgraph-extraction-traced.ts` | LangGraph + Langfuse | Requires server   | LangGraph tracing         |
| `run-extraction-experiment.ts`        | LangFuse Datasets    | Requires Langfuse | Experiment runner         |

## Test Output Example

```
Extraction Test Suite
──────────────────────────────────────────────────
  Model:     gemini-2.5-flash-lite
  Location:  europe-central2
  Runs:      3 per test
  Warmup:    1 run(s)

════════════════════════════════════════════════════════════
║ Extraction Test Suite
════════════════════════════════════════════════════════════
  Tests: 3  Runs each: 3  Warmup: 1

▸ json-prompting-person (json_prompting)
─────────────────────────────────────────────────
  Extract Person entities using JSON prompting (responseMimeType)

  Warming up (1 run)...

  Running 3 measured tests...
  [1/3] ✓ 710ms, 3 entities
  [2/3] ✓ 823ms, 3 entities
  [3/3] ✓ 756ms, 4 entities

════════════════════════════════════════════════════════════
║ Summary: json-prompting-person
════════════════════════════════════════════════════════════
  Method:       json_prompting
  Success rate: 100%
  Runs:         3/3 successful

  Performance:
    Average: 763ms
    Min:     710ms
    Max:     823ms
    Std Dev: ±46ms

  Avg entities: 3.3
```

## Verification Cascade

The verification library provides a 3-tier cascade for validating extracted entities against source text:

### Tiers

| Tier | Method                          | Cost              | Use Case               |
| ---- | ------------------------------- | ----------------- | ---------------------- |
| 1    | Exact/Fuzzy Match (Levenshtein) | $0                | Verbatim text matching |
| 2    | NLI (DeBERTa-v3-small)          | ~$0 (self-hosted) | Semantic entailment    |
| 3    | LLM Judge (Gemini)              | ~$0.001/entity    | Complex reasoning      |

### Quick Usage

```typescript
import { verifyClaim, verifyEntitiesBatch } from './lib/verification';

// Verify a single entity
const result = await verifyClaim('John Smith', documentText, {
  entityType: 'person',
  properties: { title: 'CEO', company: 'Acme Corp' },
});

console.log(result.entityVerified); // true/false
console.log(result.entityVerificationTier); // 1, 2, or 3
console.log(result.entityConfidence); // 0-1

// Batch verification
const batchResult = await verifyEntitiesBatch({
  sourceText: documentText,
  entities: [
    { id: '1', name: 'John Smith', type: 'person' },
    { id: '2', name: 'Acme Corp', type: 'organization' },
  ],
});

console.log(batchResult.summary); // { verified: 2, rejected: 0, ... }
```

### Running Verification Tests

```bash
# Test Tier 1 (Exact Match)
npx ts-node scripts/extraction_tests/tests/verification/exact-match.test.ts

# Test Full Cascade
npx ts-node scripts/extraction_tests/tests/verification/cascade.test.ts
```

### NLI Service (Tier 2)

The NLI service is a self-hosted Python FastAPI service using DeBERTa-v3-small.

**Setup (in emergent-infra repo):**

```bash
cd /path/to/emergent-infra/nli-verifier
docker compose up --build
```

**Endpoints:**

- `GET /health` - Health check
- `POST /predict` - Single prediction
- `POST /predict/batch` - Batch predictions

See `emergent-infra/nli-verifier/README.md` for full documentation.

### Configuration

```typescript
import { DEFAULT_VERIFICATION_CONFIG } from './lib/verification';

// All configurable thresholds:
const config = {
  exactMatchThreshold: 0.95, // Tier 1 Levenshtein threshold
  nliEndpoint: 'http://localhost:8080/predict',
  nliEntailmentThreshold: 0.9, // Score for "verified"
  nliContradictionThreshold: 0.7, // Score for "rejected"
  nliUncertaintyRange: [0.4, 0.6], // Escalate to Tier 3
  nliTimeoutMs: 5000,
  llmJudgeModel: 'gemini-2.0-flash-lite',
  verifyProperties: true,
  maxPropertiesPerEntity: 20,
};
```

## Key Learnings

1. **Simplified prompts are critical**: Reducing prompt from ~25000 to ~2760 chars fixed timeout issues
2. **JSON prompting is more reliable**: When `withStructuredOutput` fails, `responseMimeType: 'application/json'` works
3. **Function calling method matters**: `method: 'function_calling'` is more reliable than `method: 'json_mode'`
4. **Multi-run averaging reveals true performance**: Single runs can be misleading due to variance

## Troubleshooting

### "Cannot read properties of undefined"

- Vertex AI API issue with structured output
- Try `test-extraction-fixed.ts` to confirm API is reachable
- Wait and retry - often intermittent

### "File not found" for credentials

- Check `GOOGLE_APPLICATION_CREDENTIALS` environment variable
- Ensure `spec-server-dev-vertex-ai.json` exists in project root

### Timeouts

- Reduce prompt complexity
- Use simplified schemas (just name, type, description)
- Switch to JSON prompting method

## Environment Variables

```bash
# Required (automatically set by shared config)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/spec-server-dev-vertex-ai.json

# Optional overrides
GCP_PROJECT_ID=spec-server-dev
VERTEX_AI_LOCATION=europe-central2
VERTEX_AI_MODEL=gemini-2.5-flash-lite

# Optional (for Langfuse tests)
LANGFUSE_PUBLIC_KEY=pk-lf-xxx
LANGFUSE_SECRET_KEY=sk-lf-xxx
LANGFUSE_HOST=http://localhost:3011
```
