# Proposal: Optimize LLM Batching

## Background

The current extraction process is inefficient because the `SemanticChunkerService` is overly sensitive, often splitting text into single sentences (3500 sentences -> 3491 chunks). This forces `LangChainGeminiProvider` to make ~3500 separate LLM calls, causing slow performance, high costs, and rate limiting.

## Goal

Drastically reduce the number of LLM calls by processing data in larger, optimized batches.

## Scope

1.  **Optimize Semantic Chunking:** Prevent over-fragmentation by enforcing a minimum chunk size and tuning the similarity threshold.
2.  **Implement Extraction Batching:** Aggregating multiple semantic chunks into a single LLM extraction call (Bin-Packing) to maximize context window utilization.

## Impact

- **Performance:** Estimated 10x-50x speedup in extraction.
- **Cost:** Reduced number of requests (fewer API overheads).
- **Quality:** Better context for the LLM (seeing surrounding paragraphs improves extraction accuracy).
