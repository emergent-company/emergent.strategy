# LLM Provider Performance Comparison Tests

This document describes the LLM provider comparison script and summarizes key findings from performance testing.

## Overview

The `scripts/compare-llm-providers.ts` script compares extraction performance between:

- **Google AI Studio** (API Key authentication)
- **Vertex AI** (Service Account authentication)

Using two extraction methods:

- **responseSchema** - Structured output via response schema
- **function_calling** - Structured output via function calling

And two extraction strategies:

- **Combined** - Single call extracts entities + relationships together
- **Split** - Two-step: entities first, then relationships with entity context

## Quick Start

```bash
# Run with default settings (medium size, all providers/methods)
npx tsx scripts/compare-llm-providers.ts

# Test specific provider and method
npx tsx scripts/compare-llm-providers.ts --provider=vertex --method=function

# Test specific size
npx tsx scripts/compare-llm-providers.ts --size=xlarge

# Test split extraction only (recommended for large inputs)
npx tsx scripts/compare-llm-providers.ts --split-only --size=xlarge

# Test all sizes
npx tsx scripts/compare-llm-providers.ts --size=all
```

## CLI Options

| Option            | Values                                                 | Default  | Description                           |
| ----------------- | ------------------------------------------------------ | -------- | ------------------------------------- |
| `--provider`      | `google`, `vertex`, `all`                              | `all`    | Provider to test                      |
| `--method`        | `response`, `function`, `all`                          | `all`    | Extraction method                     |
| `--size`          | `small`, `medium`, `large`, `xlarge`, `xxlarge`, `all` | `medium` | Input data size                       |
| `--runs`          | `1-10`                                                 | `3`      | Number of measured runs               |
| `--split-only`    | flag                                                   | false    | Only run split (2-step) extraction    |
| `--combined-only` | flag                                                   | false    | Only run combined (1-step) extraction |
| `--help`          | flag                                                   | -        | Show help message                     |

## Input Sizes

| Size      | Content                  | Characters | Use Case                    |
| --------- | ------------------------ | ---------- | --------------------------- |
| `small`   | I John chapters 1-2      | ~5k        | Quick baseline, development |
| `medium`  | I John full (5 chapters) | ~8k        | Default, balanced testing   |
| `large`   | Ruth full (4 chapters)   | ~13k       | Moderate stress test        |
| `xlarge`  | Genesis chapters 1-10    | ~31k       | Push performance limits     |
| `xxlarge` | Genesis chapters 1-20    | ~62k       | Stress test limits          |

## Test Configuration

- **Model**: `gemini-2.5-flash`
- **Warmup runs**: 1 (variant skipped if warmup fails)
- **Measured runs**: 3 (configurable via `--runs`)
- **Request timeout**: 300s (5 minutes)
- **Max output tokens**: 65,535
- **Output format**: Times displayed in seconds (e.g., `122.6s`)

## Performance Test Results

### Summary: Provider Comparison (xlarge, ~31k chars)

| Metric                | Google AI Studio | Vertex AI | Winner    |
| --------------------- | ---------------- | --------- | --------- |
| **Success Rate**      | 67% (1 timeout)  | 100%      | Vertex AI |
| **Avg Duration**      | 145.6s           | 122.6s    | Vertex AI |
| **Min Duration**      | 116.6s           | 88.3s     | Vertex AI |
| **Max Duration**      | 174.6s           | 157.2s    | Vertex AI |
| **StdDev**            | 29.0s            | 28.1s     | Similar   |
| **Avg Entities**      | 171              | 169       | Similar   |
| **Avg Relationships** | 217              | 223       | Similar   |
| **Completion Tokens** | 16,091           | 10,310    | Vertex AI |

### Size Scaling Analysis

| Size    | Chars | Avg Duration | Entities | Relationships | Tokens   |
| ------- | ----- | ------------ | -------- | ------------- | -------- |
| xlarge  | ~31k  | ~99-123s     | ~170     | ~210-220      | ~40-45k  |
| xxlarge | ~62k  | ~195-280s    | ~254-276 | ~330-439      | ~76-101k |

**Scaling observations** (xlarge to xxlarge, 2x input):

- Duration: 1.6-2.3x increase (high variability)
- Entity extraction step: 1.3-1.8x increase
- Relationship step: 1.8-2.8x increase (most variable)
- Token usage: 1.7-2.3x increase
- Entity count: 1.5x increase
- Relationship count: 1.5-2x increase

**xxlarge Test Results (Genesis 1-20, ~62k chars, Vertex AI)**:

| Run | Duration | Entity Step | Rel Step | Entities | Relationships | Tokens |
| --- | -------- | ----------- | -------- | -------- | ------------- | ------ |
| 1   | 159s     | 68s         | 91s      | 224      | 293           | 68k    |
| 2   | 168s     | 69s         | 99s      | 256      | 267           | 70k    |
| 3   | 195s     | 74s         | 121s     | 254      | 330           | 76k    |
| 4   | 280s     | 89s         | 191s     | 276      | 439           | 101k   |
| 5   | 338s     | 100s        | 238s     | 268      | 412           | 114k   |

**Key observation**: xxlarge shows high variability (159-338s) due to relationship extraction complexity. The relationship step can range from 91s to 238s depending on how many relationships the model identifies.

### Split Extraction Step Breakdown

For xlarge (~31k chars) with Vertex AI:

| Step                    | Avg Time | Min   | Max   | % of Total |
| ----------------------- | -------- | ----- | ----- | ---------- |
| Entity extraction       | 54.9s    | 34.6s | 67.9s | 45%        |
| Relationship extraction | 67.8s    | 53.7s | 89.3s | 55%        |

## Key Findings

### 1. Vertex AI is More Reliable

- **100% success rate** vs 67% for Google AI Studio at xlarge size
- Google AI Studio experienced timeout failures on relationship extraction step
- Vertex AI maintains consistent performance under load

### 2. Vertex AI is Faster

- **~23s faster on average** for xlarge inputs (122.6s vs 145.6s)
- Best-case performance significantly better (88s vs 116s)
- More consistent timing (lower variance in practice)

### 3. Vertex AI is More Token-Efficient

- **35% fewer completion tokens** (10.3k vs 16.1k)
- Similar prompt token usage
- More concise output generation

### 4. Split Extraction Works for Large Inputs

- Successfully processes 31k+ char inputs
- Even step distribution (~45-55% entity/relationship)
- Enables better error isolation and retry logic

### 5. Practical Input Size Limits

| Input Size   | Recommendation                | Notes                                 |
| ------------ | ----------------------------- | ------------------------------------- |
| < 15k chars  | Safe for combined or split    | Consistent sub-60s response           |
| 15-30k chars | Use split extraction          | 60-120s response times                |
| 30-60k chars | Use split + increased timeout | 120-300s, high variability            |
| > 60k chars  | Requires chunking             | 3-6 min, very high variability, risky |

### 6. XXLarge Variability

The xxlarge tests revealed significant variability in extraction times:

- **Same input can take 159s or 338s** depending on relationship complexity
- Relationship step is the primary source of variability (91s to 238s)
- Entity extraction is more consistent (68-100s range)
- Token usage correlates with relationship count (267 rels = 70k tokens, 439 rels = 101k tokens)

**Recommendation**: For documents > 60k chars, implement chunking rather than relying on single-pass extraction.

### 7. Timeout Considerations

- **5 minute timeout** is now the default for the test script
- This provides headroom for xlarge and xxlarge inputs
- Production systems should set timeouts based on expected input size
- Consider **chunking** for inputs > 30k chars to avoid long waits and high variability

## Recommendations

### For Production Use

1. **Use Vertex AI** for extraction workloads

   - More reliable, faster, more token-efficient
   - Better for large documents

2. **Use Split Extraction** for documents > 15k chars

   - Two-step approach (entities first, then relationships)
   - Better error handling and retry capability
   - Relationship step benefits from entity context

3. **Implement Chunking** for very large documents

   - Break documents > 30k chars into chunks
   - Process chunks in parallel or sequence
   - Merge results with deduplication
   - xxlarge tests show 2x variability (159-338s) making single-pass unreliable

4. **Set Appropriate Timeouts**

   - Small/Medium: 60s
   - Large: 90s
   - XLarge: 180s
   - XXLarge: 360s (or use chunking - recommended)

5. **Monitor Token Usage**
   - Track prompt vs completion tokens
   - Vertex AI is more efficient for completion
   - Consider cost implications at scale

## Applied Production Settings

Based on the performance testing results, the following settings have been applied to the production extraction service:

### Configuration Changes

| Setting                     | Old Value        | New Value          | Rationale                                    |
| --------------------------- | ---------------- | ------------------ | -------------------------------------------- |
| `EXTRACTION_METHOD` default | `responseSchema` | `function_calling` | Better performance with Vertex AI            |
| `EXTRACTION_CHUNK_SIZE`     | 100,000 chars    | 30,000 chars       | Reduces variability, more predictable timing |
| LLM call timeout            | 120s (2 min)     | 180s (3 min)       | Handles xlarge documents without timeout     |

### Files Modified

- `apps/server/src/common/config/config.schema.ts` - Default chunk size
- `apps/server/src/common/config/config.service.ts` - Extraction method and chunk size defaults
- `apps/server/src/modules/llm/native-gemini.service.ts` - Timeout defaults
- `apps/server/src/modules/llm/google-ai-studio.service.ts` - Timeout defaults
- `apps/server/src/modules/extraction-jobs/llm/langgraph/nodes/entity-extractor.node.ts` - Node timeout
- `apps/server/src/modules/extraction-jobs/llm/langgraph/nodes/relationship-builder.node.ts` - Node timeout
- `apps/server/src/modules/extraction-jobs/llm/langgraph-extraction.provider.ts` - Pipeline timeouts

### Environment Variables

Override defaults if needed:

```bash
# Chunk size (default: 30000)
EXTRACTION_CHUNK_SIZE=30000

# Extraction method (default: function_calling)
EXTRACTION_METHOD=function_calling  # or responseSchema

# LLM call timeout (default: 300000ms = 5 min for global, 180000ms = 3 min for per-call)
LLM_CALL_TIMEOUT_MS=300000
```

### For Development/Testing

1. Use `--size=small` for quick iteration
2. Use `--size=medium` for balanced testing
3. Run `--size=all` periodically to catch regressions
4. Always test both providers before deploying changes

## Langfuse Integration

The script automatically logs to Langfuse when configured:

- **Trace ID**: Unique per test session
- **Generation spans**: Per extraction call with timing
- **Tags**: `test` environment, provider, method
- **Output**: Summary statistics per provider/method/size

Required environment variables:

```
LANGFUSE_PUBLIC_KEY=...
LANGFUSE_SECRET_KEY=...
LANGFUSE_HOST=http://localhost:3011
```

## Environment Setup

Required environment variables:

```bash
# Google AI Studio
GOOGLE_API_KEY=your-api-key

# Vertex AI
GCP_PROJECT_ID=your-project-id
VERTEX_AI_LOCATION=europe-central2  # or your region
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

# Optional: Langfuse tracing
LANGFUSE_PUBLIC_KEY=...
LANGFUSE_SECRET_KEY=...
LANGFUSE_HOST=...
```

## Output Format

The script outputs:

1. **Real-time progress** - Per-run timing and success/failure
2. **Summary tables** - Grouped by size with statistics
3. **Token usage** - Prompt and completion token averages
4. **Step breakdown** - For split extraction, entity vs relationship timing
5. **Extraction output** - Entity and relationship counts
6. **Cross-size comparison** - When testing multiple sizes
7. **Raw JSON** - Full results for further analysis

## Related Documentation

- [Extraction Worker Quick Reference](../spec/extraction-worker-quick-reference.md)
- [Context-Aware Extraction Design](../spec/context-aware-extraction-design.md)
- [Extraction Enrichment Strategy](../spec/extraction-enrichment-strategy.md)

## Changelog

- **2024-12**: Applied settings to production: function_calling default, 30K chunk size, 180s timeout
- **2024-12**: Updated script output to show times in seconds instead of milliseconds
- **2024-12**: Added `--runs` option for configurable measured runs
- **2024-12**: Completed xxlarge testing with 5 runs showing high variability (159-338s)
- **2024-12**: Added xxlarge size (Genesis 1-20, ~62k chars)
- **2024-12**: Added input size testing (`--size` option)
- **2024-12**: Added split extraction (2-step entity/relationship)
- **2024-12**: Initial comparison script with Langfuse integration
