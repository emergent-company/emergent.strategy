# Tasks: Optimize LLM Batching

- [ ] Add `minChunkSize` and `minSentences` parameters to `SemanticChunkerService` to prevent single-sentence chunks <!-- id: 0 -->
- [ ] Lower default `SIMILARITY_THRESHOLD` to 0.6 in `SemanticChunkerService` <!-- id: 1 -->
- [ ] Implement `BinPackingService` or logic in `LangChainGeminiProvider` to aggregate chunks into batches (target 8k tokens) <!-- id: 2 -->
- [ ] Update `LangChainGeminiProvider` to send aggregated batches to LLM instead of single chunks <!-- id: 3 -->
