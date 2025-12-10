# Improvement Suggestion: Extraction Evaluation Enhancements

**Status:** Proposed  
**Priority:** Medium  
**Category:** Testing / Developer Experience  
**Proposed:** 2025-12-07  
**Proposed by:** AI Agent  
**Assigned to:** Unassigned

---

## Summary

Enhance the extraction evaluation system with semantic relationship type matching, improved dataset quality, and LLM precision tuning to improve relationship F1 scores.

---

## Current State

The extraction evaluation system now supports:

- Fuzzy entity name matching (Levenshtein similarity >= 0.85)
- Inverse relationship type matching (e.g., `PARENT_OF` <-> `CHILD_OF`)
- Symmetric relationship matching (e.g., `MARRIED_TO` matches regardless of direction)

**Limitations observed in recent experiments:**

1. **Semantic relationship type mismatches:** Expected `TRAVELS_TO` but LLM extracts `LIVED_IN` - semantically similar but not recognized as equivalent
2. **Missing expected relationships in dataset:** Some dataset items have no expected relationships, causing misleading F1=0
3. **Low precision:** LLM extracts 3-4x more relationships than expected (e.g., 35 extracted vs 10 expected)

**Recent experiment results (verify-matching-improvements):**

| Item                 | Entity F1 | Relationship Recall | Relationship F1 | Issue                                 |
| -------------------- | --------- | ------------------- | --------------- | ------------------------------------- |
| ruth-ch1-return      | 0.80      | 0%                  | 0%              | Type mismatch: TRAVELS_TO vs LIVED_IN |
| ruth-ch1-declaration | 0.86      | N/A                 | N/A             | No expected relationships             |
| ruth-ch4-genealogy   | 0.96      | 100%                | 0.39            | Low precision (many extra)            |
| ruth-ch2-boaz        | 0.83      | 100%                | 0.31            | Low precision                         |
| ruth-ch1-intro       | 0.91      | 100%                | 0.44            | Low precision                         |

---

## Proposed Improvements

### 1. Semantic Relationship Type Similarity

Add support for semantically equivalent relationship types that aren't strict inverses:

```typescript
const SEMANTIC_EQUIVALENT_TYPES: Record<string, string[]> = {
  travels_to: ['arrives_at', 'goes_to', 'journeys_to'],
  lived_in: ['resided_in', 'dwelt_in', 'inhabited'],
  works_for: ['employed_by', 'serves'],
  // Add more as needed
};
```

**Benefits:**

- Recognize `TRAVELS_TO` and `LIVED_IN` as partial matches
- Improve recall without false positives
- Better reflect real-world semantic equivalence

### 2. Improve Golden Dataset Quality

Review and enhance `extraction-golden` dataset items:

- **Add missing expected relationships** to `ruth-ch1-declaration`
- **Accept multiple valid relationship types** where semantically appropriate
- **Add alternative acceptable outputs** for ambiguous extractions

**Dataset item format enhancement:**

```json
{
  "relationships": [
    {
      "source_name": "Naomi",
      "target_name": "Bethlehem",
      "relationship_type": "TRAVELS_TO",
      "acceptable_types": ["TRAVELS_TO", "ARRIVES_AT", "GOES_TO"]
    }
  ]
}
```

### 3. LLM Precision Tuning

Reduce over-extraction by:

- **Prompt engineering:** Add instructions to extract only explicitly stated relationships
- **Confidence thresholds:** Filter low-confidence relationships before evaluation
- **Relationship deduplication:** Merge inverse/symmetric duplicates post-extraction

### 4. Enhanced Evaluation Metrics

Add new metrics to better understand extraction quality:

- **Semantic F1:** Using semantic similarity for relationship types
- **Strict vs Relaxed F1:** Separate scores for exact vs fuzzy matching
- **Over-extraction ratio:** Track how much the LLM over-extracts

---

## Benefits

- **User Benefits:** More accurate quality assessment of extraction results
- **Developer Benefits:** Better insight into where extraction fails and why
- **System Benefits:** More meaningful metrics for model comparison and prompt tuning
- **Business Benefits:** Data-driven optimization of extraction quality

---

## Implementation Approach

### Phase 1: Dataset Improvements (Small effort)

1. Review `extraction-golden` dataset items
2. Add missing expected relationships
3. Document ambiguous cases

### Phase 2: Semantic Type Matching (Medium effort)

1. Define `SEMANTIC_EQUIVALENT_TYPES` mapping
2. Add semantic matching logic to `relationshipsMatch()`
3. Track semantic match type in results

### Phase 3: LLM Precision Tuning (Medium effort)

1. Review extraction prompts (entity-extractor, relationship-builder)
2. Add explicit instructions about precision vs recall tradeoff
3. Test with updated prompts

### Phase 4: Enhanced Metrics (Small effort)

1. Add new score types to evaluation
2. Update aggregation logic
3. Display in experiment summaries

**Affected Components:**

- `apps/server/src/modules/extraction-jobs/evaluation/evaluators.ts`
- `apps/server/src/modules/extraction-jobs/evaluation/types.ts`
- LangFuse dataset: `extraction-golden`
- LangFuse prompts: `entity-extractor`, `relationship-builder`

**Estimated Effort:** Medium (2-3 days total across phases)

---

## Alternatives Considered

### Alternative 1: Embedding-based Relationship Type Matching

- Use embedding similarity to match relationship types
- Pros: More flexible, learns from context
- Cons: Adds complexity, requires embedding model, harder to debug
- Why not chosen: Simpler rule-based approach sufficient for now

### Alternative 2: Accept Any Relationship Type Match

- Ignore relationship type entirely, just match entities
- Pros: Simple, high recall
- Cons: Loses important semantic information, poor precision
- Why not chosen: Type information is valuable for evaluation

---

## Risks & Considerations

- **Breaking Changes:** No - additive changes only
- **Performance Impact:** Neutral - minimal compute overhead
- **Security Impact:** Neutral - evaluation only, no production impact
- **Dependencies:** None
- **Migration Required:** No - existing datasets/experiments remain valid

---

## Success Metrics

- **Relationship recall >= 90%** across all dataset items
- **Relationship F1 >= 0.6** average (up from current ~0.3)
- **Reduced false negatives** from semantic type mismatches
- **Clear documentation** of what counts as a match

---

## Testing Strategy

- [ ] Unit tests for semantic type matching
- [ ] Integration tests with updated dataset
- [x] Experiment runs comparing before/after metrics
- [ ] Review matched/unmatched relationships manually

---

## Related Items

- Related to inverse/symmetric matching improvements (completed 2025-12-07)
- Related to LangFuse experiment infrastructure
- May benefit from future embedding-based entity resolution

---

## References

- `apps/server/src/modules/extraction-jobs/evaluation/evaluators.ts:337` - `relationshipsMatch()` function
- `apps/server/src/modules/extraction-jobs/evaluation/types.ts` - Type definitions
- LangFuse dataset: `extraction-golden`
- Recent experiment: `verify-matching-improvements`

---

## Notes

The inverse and symmetric matching improvements implemented on 2025-12-07 significantly improved relationship matching:

- Items 3, 4, 5 now achieve 100% relationship recall
- Item 1 fails due to semantic type mismatch (TRAVELS_TO vs LIVED_IN)
- Item 2 has no expected relationships in dataset

The LLM consistently over-extracts relationships (3-4x expected count), which is the primary driver of low F1 scores. This may be acceptable if the goal is high recall, with post-processing to filter/deduplicate.

---

**Last Updated:** 2025-12-07 by AI Agent
