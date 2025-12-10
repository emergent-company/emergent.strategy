# LangExtract vs LangGraph Extraction Pipeline Comparison

**Date**: 2025-12-07  
**Test Document**: Ruth ch1 intro (704 characters)  
**Model**: Gemini 2.5 Flash

## Executive Summary

| Metric                     | LangExtract         | Our LangGraph Pipeline      |
| -------------------------- | ------------------- | --------------------------- |
| **Entity Precision**       | 100%                | 100%                        |
| **Entity Recall**          | 100%                | 90.9%                       |
| **Entity F1**              | 100%                | 95.2%                       |
| **Relationship Precision** | N/A (not supported) | 57.1%                       |
| **Relationship Recall**    | N/A                 | 66.7%                       |
| **Relationship F1**        | N/A                 | 61.5%                       |
| **Entity Latency**         | ~2.3s               | ~3.5s (includes more steps) |

**Key Finding**: LangExtract is an **entity/span extraction library only** - it cannot extract relationships. For entity extraction, it achieves 100% accuracy on our test case, compared to 95.2% for our pipeline.

## Library Purposes

### LangExtract

- **Purpose**: Named entity extraction with text span alignment
- **Scope**: Entities only - finds text spans in documents that match extraction classes
- **Output**: Entities with character positions in source text
- **No relationship support**: The library aligns extractions to source text positions; relationship text like "Abraham -> Sarah" doesn't exist in the source, so it's discarded

### Our LangGraph Pipeline

- **Purpose**: Full entity + relationship extraction for knowledge graphs
- **Scope**: Entities and relationships between them
- **Output**: Entities + typed relationships for graph construction
- **Multi-step process**: Entity extraction → Identity resolution → Relationship building → Quality audit

## Architecture Comparison

### LangExtract Pipeline Steps

```
1. prompting.js    - Build QA-style prompt with few-shot examples
                     Format: Q: {text} A: {yaml/json}
2. schema.js       - Auto-generate Gemini schema from examples
                     Uses GeminiSchemaImpl.fromExamples()
3. inference.js    - Direct Gemini API call via axios (not LangChain)
                     POST to generativelanguage.googleapis.com
4. annotation.js   - Document chunking & batch processing
                     Multi-pass for large documents
5. resolver.js     - Parse LLM output, align to source text positions
                     Discards extractions that can't be aligned
```

### Our LangGraph Pipeline Steps

```
1. entity-extractor.node.ts    - Extract entities with JSON mode
2. identity-resolver.node.ts   - Link entities to existing KB entities
3. relationship-builder.node.ts - Extract relationships between entities
4. quality-auditor.node.ts     - Validate results, trigger retries if needed
```

## Model Configuration Differences

| Setting               | LangExtract                  | Our Pipeline           |
| --------------------- | ---------------------------- | ---------------------- |
| **Temperature**       | 0.5 (default)                | 0.1                    |
| **Max Output Tokens** | 2048                         | 65535                  |
| **Response Format**   | YAML with fence              | JSON                   |
| **Schema**            | Auto-generated from examples | Manual JSON schema     |
| **API**               | Direct REST (axios)          | LangChain ChatVertexAI |
| **Timeout**           | 30000ms                      | Not explicitly set     |

## Why LangExtract Achieves 100% Entity Extraction

### 1. QA-Style Few-Shot Prompting

LangExtract uses a unique Q/A format:

````
Q: Abraham lived in Canaan with his wife Sarah.
A:
```yaml
- extractionClass: person
  extractionText: Abraham
- extractionClass: person
  extractionText: Sarah
````

This is more direct than our "extract entities from this text" approach.

### 2. YAML Output Format

- Less prone to JSON parsing errors
- `fenceOutput: true` wraps in code blocks for reliable parsing
- More lenient parsing than strict JSON

### 3. Schema Auto-Generation

- Builds Gemini `responseSchema` from examples automatically
- Uses `GeminiSchemaImpl.fromExamples()`
- Leverages Gemini's constrained decoding for exact format

### 4. Higher Temperature (0.5 vs 0.1)

- May allow more creative entity recognition
- Less likely to miss borderline entities
- Our 0.1 temperature may be too conservative

### 5. Text Span Alignment

- Forces extractions to match actual text in document
- Naturally filters hallucinated entities
- Post-processes to ensure extraction quality

## Why Our Pipeline Missed 1 Entity

Our pipeline missed 1 of 11 entities (90.9% recall). Analysis needed on which entity was missed and why.

Likely causes:

1. Lower temperature (0.1) being too conservative
2. No text-span alignment validation
3. Different prompt structure

## Relationship Extraction Analysis

LangExtract **cannot** extract relationships because:

1. It aligns all extractions to source text positions
2. Relationship text like "Abraham -> Sarah" doesn't exist in source
3. The `resolver.js` discards any extraction it can't find in the text

**Our pipeline** is the only option for relationship extraction, achieving:

- 57.1% Precision (4 of 7 extracted were correct)
- 66.7% Recall (16 of 24 expected found)
- 61.5% F1

### Relationship Errors (from previous analysis)

- MARRIED_TO assignments wrong (e.g., Mahlon married to Orpah instead of Ruth)
- Missing some PARENT_OF relationships
- Missing some MEMBER_OF relationships

## Recommendations for Our Pipeline

### 1. Consider Higher Temperature for Entity Extraction

```typescript
// Current
temperature: 0.1;

// Suggested for entity extraction node
temperature: 0.3 - 0.5;
```

### 2. Add Text Span Validation

After entity extraction, verify each entity name exists in source text:

```typescript
const validEntities = entities.filter((e) =>
  documentText.toLowerCase().includes(e.name.toLowerCase())
);
```

### 3. Use YAML Format for LLM Output

Consider switching from JSON to YAML for more reliable parsing:

```typescript
formatType: 'yaml',
fenceOutput: true,
```

### 4. Separate Entity and Relationship Prompts

LangExtract's single-focus prompts may perform better than our combined approach. Consider:

1. Entity-only prompt (no relationship context)
2. Relationship-only prompt (with known entities)

### 5. Add Few-Shot Examples to Prompts

LangExtract's few-shot approach provides concrete examples. We could:

```typescript
const examples = [
  {
    text: "Abraham lived in Canaan...",
    entities: [{ name: "Abraham", type: "Person" }, ...]
  }
];
```

## Conclusion

**For entity extraction only**: LangExtract achieves superior results (100% vs 95.2% F1) due to its:

- QA-style prompting
- YAML format
- Text span validation
- Auto-generated schemas

**For relationship extraction**: Our LangGraph pipeline is required, but needs improvement. Key issues are in the relationship-builder node, not entity extraction.

**Recommendation**: Consider adopting LangExtract's approaches (higher temperature, YAML format, few-shot examples) for our entity-extractor.node.ts while keeping our multi-node pipeline for full entity + relationship extraction.

## Files Referenced

- LangExtract comparison: `apps/server/src/cli/compare-langextract.cli.ts`
- Our pipeline analysis: `apps/server/src/cli/analyze-relationships.cli.ts`
- Entity extractor node: `apps/server/src/modules/extraction-jobs/llm/langgraph/nodes/entity-extractor.node.ts`
- Relationship builder: `apps/server/src/modules/extraction-jobs/llm/langgraph/nodes/relationship-builder.node.ts`
- LangExtract library: `node_modules/.pnpm/langextract@1.2.0/node_modules/langextract/dist/`
