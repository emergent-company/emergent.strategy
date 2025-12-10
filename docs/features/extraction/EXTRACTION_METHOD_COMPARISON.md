# Extraction Method Comparison: LangChain vs Native SDK

**Date:** 2024-12-09  
**Model:** `gemini-2.5-flash-lite` on Vertex AI (`europe-central2`)

## Executive Summary

We tested multiple approaches for structured entity extraction from documents using Gemini on Vertex AI. **The key finding is that LangChain's `withStructuredOutput` with function calling mode has a critical bug that causes 100% failure rate**, while all other methods work reliably.

## Test Results

| Method                             | SDK        | Success Rate | Avg Duration | Entities |
| ---------------------------------- | ---------- | ------------ | ------------ | -------- |
| JSON Prompting (Person)            | LangChain  | **100%**     | 559ms        | 1        |
| JSON Prompting (Multi)             | LangChain  | **100%**     | 1452ms       | 12       |
| Function Calling                   | LangChain  | **0%**       | timeout ~23s | 0        |
| Structured Output (responseSchema) | Native SDK | **100%**     | 1947ms       | 12-13    |
| Function Calling (tools)           | Native SDK | **100%**     | 1416ms       | 10       |

## Detailed Findings

### LangChain `withStructuredOutput` Bug

When using LangChain's `ChatVertexAI.withStructuredOutput()` with `method: 'function_calling'`, all requests timeout after ~20-24 seconds with no response. This is **not** an issue with the Gemini API itself - the native SDK's function calling works perfectly.

```typescript
// THIS DOES NOT WORK - Times out 100% of the time
const structuredModel = baseModel.withStructuredOutput(
  ZOD_SCHEMAS.extractionResponse,
  { method: 'function_calling', name: 'extract_entities' }
);
await structuredModel.invoke(prompt); // Always times out
```

### Working Approaches

#### 1. LangChain JSON Prompting (Recommended for LangChain users)

```typescript
const model = new ChatVertexAI({
  model: 'gemini-2.5-flash-lite',
  responseMimeType: 'application/json', // Key setting
  temperature: 0.1,
});

const prompt = `Extract entities... Return JSON matching this schema: ${schema}`;
const result = await model.invoke(prompt);
const entities = JSON.parse(result.content);
```

**Pros:** Fast (559-1452ms), reliable, works with LangChain ecosystem  
**Cons:** Requires explicit JSON schema in prompt

#### 2. Native SDK with responseSchema (Best for structured output)

```typescript
import { GoogleGenAI, Type } from '@google/genai';

const ai = new GoogleGenAI({
  vertexai: true,
  project: 'your-project',
  location: 'europe-central2',
});

const response = await ai.models.generateContent({
  model: 'gemini-2.5-flash-lite',
  contents: prompt,
  config: {
    responseMimeType: 'application/json',
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        entities: {
          type: Type.ARRAY,
          items: {
            /* schema */
          },
        },
      },
    },
    temperature: 0.1,
  },
});

const entities = JSON.parse(response.text);
```

**Pros:** Schema enforcement at API level, no prompt engineering needed  
**Cons:** Slightly slower, not LangChain compatible

#### 3. Native SDK with Function Calling

```typescript
const response = await ai.models.generateContent({
  model: 'gemini-2.5-flash-lite',
  contents: prompt,
  config: {
    tools: [{ functionDeclarations: [extractEntitiesDeclaration] }],
    toolConfig: {
      functionCallingConfig: {
        mode: FunctionCallingConfigMode.ANY,
        allowedFunctionNames: ['extract_entities'],
      },
    },
  },
});

const functionCall = response.functionCalls[0];
const entities = functionCall.args.entities;
```

**Pros:** Fast (~1.4s), reliable, good for agentic workflows  
**Cons:** Not LangChain compatible

## Recommendations

### For New Projects

Use the **Native Google SDK** (`@google/genai`) with `responseSchema` for structured extraction. It's more reliable and doesn't have the LangChain wrapper overhead.

```bash
pnpm add @google/genai
```

### For Existing LangChain Projects

Use **JSON Prompting** with `responseMimeType: 'application/json'`. Avoid `withStructuredOutput` with `method: 'function_calling'` until the bug is fixed.

### Migration Path

If currently using LangChain's `withStructuredOutput`:

1. **Immediate fix:** Switch to JSON prompting with `responseMimeType`
2. **Long-term:** Consider migrating to the native SDK for better reliability

## Test Files

All extraction tests are in `/scripts/extraction_tests/`:

- `run-all.ts` - Run all tests with comparison
- `tests/json-prompting.test.ts` - LangChain JSON prompting
- `tests/function-calling.test.ts` - LangChain function calling (broken)
- `tests/native-sdk.test.ts` - Native SDK structured output
- `tests/native-function-calling.test.ts` - Native SDK function calling

Run tests:

```bash
npx tsx scripts/extraction_tests/run-all.ts --runs=3
```

## Environment

- Node.js 22.x
- `@langchain/google-vertexai`: 1.0.4
- `@google/genai`: 1.32.0
- GCP Project: `spec-server-dev`
- Region: `europe-central2`
- Model: `gemini-2.5-flash-lite`

## Related Issues

- Searched LangChain GitHub issues but found no direct match for this timeout issue
- Issue #9405 (propertyOrdering support) is related but different

## Tracing

All test runs are traced to Langfuse at `http://localhost:3011` with:

- Success rate scores
- Duration metrics
- Entity count per run
