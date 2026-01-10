# Change: Add Semantic Chunking Strategies

## Why

The current ingestion pipeline uses a simple character-based chunker (`ChunkerService`) that splits text at fixed 1200-character boundaries without regard for semantic boundaries. This breaks sentences mid-word and paragraphs mid-thought, which degrades both embedding quality and retrieval accuracy. Documents created from structured content (chapters, sections, numbered lists) lose their natural organization when chunked arbitrarily.

## What Changes

- **Add chunking strategy selection** to the ingestion API with configurable strategies
- **Implement sentence-preserving chunking** that respects sentence boundaries (`.`, `!`, `?`)
- **Implement paragraph-preserving chunking** that respects paragraph/section boundaries (`\n\n`, headers)
- **Persist chunking metadata** including strategy used and boundary markers for debugging
- **Extend ChunkerService** with multiple strategies while maintaining backward compatibility
- **Update ingestion DTOs** to accept optional chunking configuration

**Note:** This change focuses on the ingestion chunking pipeline (`ChunkerService`), not the extraction chunking (`LangChainGeminiProvider`) which already uses `RecursiveCharacterTextSplitter`.

## Impact

- **Affected specs:** document-management
- **Affected code:**
  - `apps/server/src/common/utils/chunker.service.ts` - Core chunking logic
  - `apps/server/src/modules/ingestion/ingestion.service.ts` - Integration point
  - `apps/server/src/modules/ingestion/dto/` - DTOs for chunking config
  - `apps/server/src/entities/chunk.entity.ts` - Optional metadata column
- **Migration:** None required for existing data; new chunks will use default strategy (character-based for backward compatibility)
- **API compatibility:** Fully backward compatible; chunking strategy is optional
