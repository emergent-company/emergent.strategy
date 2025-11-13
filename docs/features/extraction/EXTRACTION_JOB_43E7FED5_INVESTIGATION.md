# Extraction Job Investigation - Job ID: 43e7fed5-31f5-4853-ae9c-2e04aad0780c

**Date**: October 20, 2025  
**Issue**: Invalid JSON response from LLM  
**Root Cause**: MAX_TOKENS (finish_reason: MAX_TOKENS)  
**Status**: ✅ RESOLVED - Chunking implemented in `vertex-ai.provider.ts`

> **UPDATE**: After implementing enhanced error logging, confirmed the root cause was `finish_reason: MAX_TOKENS`.  
> **SOLUTION IMPLEMENTED**: Document chunking with overlap now implemented in Vertex AI provider.  
> **See**: `docs/EXTRACTION_CHUNKING_IMPLEMENTATION.md` for full implementation details.

## Problem Summary

Extraction job failed with error: `Invalid JSON response from LLM`

### Job Details
- **Job ID**: `43e7fed5-31f5-4853-ae9c-2e04aad0780c`
- **Status**: `failed`
- **Created**: 2025-10-20T11:51:46.962Z
- **Started**: 2025-10-20T11:51:49.447Z
- **Completed**: 2025-10-20T11:52:53.778Z
- **Duration**: ~64 seconds (64,168 ms for LLM call)
- **Document ID**: `null` (manual extraction)

### Error Stack
```
Error: Invalid JSON response from LLM
    at VertexAIProvider.extractEntities (/Users/mcj/code/spec-server/apps/server/src/modules/extraction-jobs/llm/vertex-ai.provider.ts:131:23)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at ExtractionWorkerService.processJob (/Users/mcj/code/spec-server/apps/server/src/modules/extraction-jobs/extraction-worker.service.ts:479:32)
    at ExtractionWorkerService.processBatch (/Users/mcj/code/spec-server/apps/server/src/modules/extraction-jobs/extraction-worker.service.ts:277:13)
    at Timeout.tick [as _onTimeout] (/Users/mcj/code/spec-server/apps/server/src/modules/extraction-jobs/extraction-worker.service.ts:237:17)
```

## Root Cause Analysis

### Issue 1: Missing Document Chunking in Vertex AI Provider

**Finding**: The `vertex-ai.provider.ts` does **not** split documents into chunks before sending to the LLM.

**Comparison**:
- ✅ `langchain-gemini.provider.ts`: Has `splitDocumentIntoChunks()` method and processes documents in chunks
- ❌ `vertex-ai.provider.ts`: Sends entire document in one call

**Impact**: 
- Large documents exceed model's context window
- LLM may return truncated/incomplete responses
- JSON parsing fails if response is cut off mid-JSON
- No `finish_reason` checking to detect max_tokens exceeded

### Issue 2: Limited Error Context in Logs

**Before This Session**:
- Error logs showed only: "Invalid JSON response from LLM"
- No visibility into:
  - Actual LLM response text
  - Response length
  - Finish reason (STOP, MAX_TOKENS, SAFETY, etc.)
  - What JSON extraction attempted

**For Future Failures**:
Users couldn't diagnose why extraction failed or see if document was too long.

## Solutions Implemented

### 1. Enhanced Error Logging ✅

**Modified**: `vertex-ai.provider.ts`

**Changes**:
```typescript
// Before (line 124-129)
} catch (parseError) {
    this.logger.error('Failed to parse LLM response as JSON', { text, parseError });
    throw new Error('Invalid JSON response from LLM');
}

// After
} catch (parseError) {
    const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
    const finishReason = response.candidates?.[0]?.finishReason;
    
    this.logger.error('Failed to parse LLM response as JSON', {
        rawText: text.substring(0, 5000), // First 5000 chars
        extractedJson: jsonText.substring(0, 5000),
        parseError: errorMessage,
        responseLength: text.length,
        finishReason,
        safetyRatings: response.candidates?.[0]?.safetyRatings,
    });
    
    // Throw with enhanced error including response metadata
    const error: Error & { responseMetadata?: any } = new Error(
        finishReason && finishReason !== 'STOP' 
            ? `Invalid JSON response from LLM (finish_reason: ${finishReason})`
            : 'Invalid JSON response from LLM'
    );
    
    // Attach metadata for logging
    error.responseMetadata = {
        rawTextPreview: text.substring(0, 1000),
        responseLength: text.length,
        finishReason,
        extractedJsonPreview: jsonText.substring(0, 1000),
        parseError: errorMessage,
    };
    
    throw error;
}
```

**Benefits**:
- Error message now includes `finish_reason` if not STOP
- First 5000 chars of LLM response logged for inspection
- Metadata attached to error for extraction logs

### 2. Extraction Log Enhancement ✅

**Modified**: `extraction-worker.service.ts` (lines 545-568)

**Changes**:
```typescript
} catch (error) {
    const message = toErrorMessage(error);
    const errorWithMeta = error as Error & { llmStepMetadata?: Record<string, any>; responseMetadata?: any };
    const metadata = errorWithMeta.llmStepMetadata;
    const responseMetadata = errorWithMeta.responseMetadata;

    // Log LLM call error with full context
    await this.extractionLogger.logStep({
        extractionJobId: job.id,
        stepIndex: this.stepCounter++,
        operationType: 'error',
        operationName: 'extract_entities',
        status: 'error',
        errorMessage: message,
        errorStack: (error as Error).stack,
        durationMs: Date.now() - llmCallStartTime,
        outputData: responseMetadata ? {
            llm_response_preview: responseMetadata.rawTextPreview,
            response_length: responseMetadata.responseLength,
            finish_reason: responseMetadata.finishReason,
            extracted_json_preview: responseMetadata.extractedJsonPreview,
            parse_error: responseMetadata.parseError,
        } : undefined,
        metadata: {
            provider: providerName,
            ...metadata,
        },
    });
```

**Benefits**:
- LLM response preview now saved to `output_data` in extraction logs
- Visible in UI when viewing extraction job details
- Users can see exactly what the LLM returned
- Can diagnose if response was truncated, malformed, or exceeded limits

## What Users Will See Now

### In Extraction Logs UI (Step Details)

When expanding the failed `extract_entities` step, users will now see:

**Output Data**:
```json
{
  "llm_response_preview": "Here is the extracted data...\n{\"entities\": [truncated]",
  "response_length": 125000,
  "finish_reason": "MAX_TOKENS",
  "extracted_json_preview": "{\"entities\": [truncated",
  "parse_error": "Unexpected end of JSON input"
}
```

**This tells the user**:
- ✅ Response was 125KB long
- ✅ LLM hit MAX_TOKENS limit (output was truncated)
- ✅ JSON extraction found incomplete JSON
- ✅ Parsing failed because JSON was cut off

**Actionable**: User knows to either:
- Use a different LLM provider (with chunking support)
- Reduce document size
- Wait for chunking implementation in vertex-ai provider

## Recommended Next Steps

### Short-term (Immediate Workarounds)

1. **Switch to LangChain Gemini Provider**
   - Already has chunking implemented
   - Handles large documents automatically
   - More robust error handling

2. **Reduce Document Size**
   - Extract from shorter documents
   - Pre-process documents to remove unnecessary content
   - Split document manually before extraction

### Medium-term (Next Sprint)

3. **Implement Chunking in Vertex AI Provider** 🔴 HIGH PRIORITY

**Implementation Plan**:

```typescript
// apps/server/src/modules/extraction-jobs/llm/vertex-ai.provider.ts

async extractEntities(
    documentContent: string,
    extractionPrompt: string,
    objectSchemas: Record<string, GraphObjectTypeSchema>,
    allowedTypes?: string[]
): Promise<LLMExtractionResult> {
    // 1. Split document into chunks (similar to langchain-gemini)
    const chunks = await this.splitDocumentIntoChunks(documentContent);
    
    if (chunks.length > 1) {
        this.logger.log(`Document split into ${chunks.length} chunks`);
    }
    
    // 2. Process each chunk separately
    const allEntities: ExtractedEntity[] = [];
    const discoveredTypes = new Set<string>();
    let totalTokens = 0;
    
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        // Extract entities from this chunk
        const result = await this.extractFromChunk(chunk, extractionPrompt, objectSchemas, allowedTypes);
        
        allEntities.push(...result.entities);
        result.discovered_types.forEach(t => discoveredTypes.add(t));
        totalTokens += result.usage?.total_tokens || 0;
    }
    
    // 3. Deduplicate entities across chunks
    const deduped = this.deduplicateEntities(allEntities);
    
    // 4. Return combined results
    return {
        entities: deduped,
        discovered_types: Array.from(discoveredTypes),
        usage: {
            prompt_tokens: 0, // Aggregate if available
            completion_tokens: 0,
            total_tokens: totalTokens,
        },
    };
}

private async splitDocumentIntoChunks(content: string): Promise<string[]> {
    const MAX_CHUNK_CHARS = 30000; // ~7500 tokens (4 chars per token average)
    
    if (content.length <= MAX_CHUNK_CHARS) {
        return [content];
    }
    
    // TODO: Implement smart chunking (respect sentence/paragraph boundaries)
    const chunks: string[] = [];
    for (let i = 0; i < content.length; i += MAX_CHUNK_CHARS) {
        chunks.push(content.substring(i, i + MAX_CHUNK_CHARS));
    }
    
    return chunks;
}

private deduplicateEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
    // Group by type and name, keep first occurrence
    const seen = new Map<string, ExtractedEntity>();
    
    for (const entity of entities) {
        const key = `${entity.type_name}:${entity.name.toLowerCase()}`;
        if (!seen.has(key)) {
            seen.set(key, entity);
        }
    }
    
    return Array.from(seen.values());
}
```

**Estimated Effort**: 4-6 hours
- Copy chunking logic from langchain-gemini
- Add chunk index tracking
- Test with large documents
- Ensure deduplication works correctly

### Long-term (Future Enhancements)

4. **Smart Chunking Strategy**
   - Respect sentence boundaries
   - Keep paragraphs together
   - Avoid breaking mid-entity reference
   - Use RecursiveCharacterTextSplitter from LangChain

5. **Model Context Window Detection**
   - Query model capabilities
   - Adjust chunk size based on model
   - Handle different models (Gemini 1.5 has 2M token limit)

6. **Streaming Responses**
   - Use streaming API for large responses
   - Detect incomplete JSON mid-stream
   - Request continuation if truncated

## Testing After Fix

### Reproduction Steps

1. Navigate to extraction jobs page
2. Trigger manual extraction with job ID: `43e7fed5-31f5-4853-ae9c-2e04aad0780c`
3. Click "View Logs" button
4. Expand the failed `extract_entities` step
5. Check "Output" section

### Expected Result

Should see detailed error context:
```json
{
  "llm_response_preview": "[First 1000 chars of what LLM returned]",
  "response_length": 125000,
  "finish_reason": "MAX_TOKENS",
  "extracted_json_preview": "{\"entities\": [...",
  "parse_error": "Unexpected end of JSON input"
}
```

### Verification Checklist

- [ ] Error message includes finish_reason if not STOP
- [ ] LLM response preview visible in logs UI
- [ ] Response length displayed
- [ ] Parse error details shown
- [ ] User can determine root cause from logs alone

## Related Issues

### Similar Patterns
- Any extraction using vertex-ai provider with documents > 30K chars
- All manual extractions without chunking support
- Auto-extraction jobs hitting same limit

### Prevention
After implementing chunking in vertex-ai provider:
- All large documents will be handled automatically
- No user intervention needed
- Consistent behavior across all LLM providers

## Documentation Created

- `docs/EXTRACTION_JOB_43E7FED5_INVESTIGATION.md` (this file)
- Enhanced inline code comments in vertex-ai.provider.ts
- Enhanced inline code comments in extraction-worker.service.ts

## References

- Vertex AI Gemini Model Docs: https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/gemini
- LangChain Chunking: https://js.langchain.com/docs/modules/data_connection/document_transformers/
- Existing implementation: `langchain-gemini.provider.ts` lines 85-185

## Conclusion

### Immediate Impact
✅ Users can now diagnose LLM failures from extraction logs  
✅ Error messages more descriptive  
✅ Response preview helps identify truncation issues  

### Next Sprint Goal
🎯 Implement chunking in vertex-ai.provider.ts to handle large documents automatically

### Success Criteria
- All documents < 1MB process successfully
- Chunking happens transparently
- Entities deduplicated across chunks
- Performance remains acceptable (<2min for 100KB doc)
