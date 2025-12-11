## 1. Update Chunk Size Presets and Defaults

- [ ] 1.1 Update `CHUNKING_PRESETS` constant with new aligned values:
  - Precise: maxChunkSize 3750, minChunkSize 1500
  - Balanced: maxChunkSize 7500, minChunkSize 3000
  - Comprehensive: maxChunkSize 15000, minChunkSize 6000
- [ ] 1.2 Add `llmAlignment` label to each preset (e.g., "Conservative (15K)")
- [ ] 1.3 Update `DEFAULT_CONFIG` to use aligned defaults (7500/3000, strategy: sentence)
- [ ] 1.4 Add `DEFAULT_LLM_CHUNK_SIZE` constant (30000)

## 2. Add LLM Alignment Helper Functions

- [ ] 2.1 Add `calculateSuggestedChunks(llmChunkSize)` function returning maxChunkSize (LLM/4) and minChunkSize (LLM/10)
- [ ] 2.2 Add `getAlignmentStatus(currentMax, suggestedMax)` function returning 'aligned' | 'close' | 'misaligned'
- [ ] 2.3 Add `alignmentConfig` object with color, icon, label, and description for each status

## 3. Add LLM Alignment Card UI

- [ ] 3.1 Compute `llmChunkSize` from project's extraction_config (fallback to DEFAULT_LLM_CHUNK_SIZE)
- [ ] 3.2 Compute suggested values and alignment status in component
- [ ] 3.3 Add "LLM Alignment" card after Quick Presets card with:
  - Current LLM batch size display (linked to LLM settings page)
  - Suggested vs current max chunk comparison
  - Alignment status badge with icon and description
  - Info text explaining the 1:4 ratio recommendation
  - "Apply Suggested Settings" button (shown when not aligned)

## 4. Update Input Constraints

- [ ] 4.1 Update maxChunkSize input: max from 10000 to 25000, min from 100 to 500
- [ ] 4.2 Update minChunkSize input: max from 1000 to 10000
- [ ] 4.3 Update recommended text labels to reflect new ranges

## 5. Update Preset Card Display

- [ ] 5.1 Update token estimates in presets to reflect new sizes
- [ ] 5.2 Add LLM alignment label display in preset cards (e.g., "Aligns with LLM: Balanced (30K)")

## 6. Validation

- [ ] 6.1 Build admin app successfully (`nx run admin:build`)
- [ ] 6.2 Manually test Document Processing settings page
- [ ] 6.3 Verify alignment card shows correct suggested values
- [ ] 6.4 Verify "Apply Suggested Settings" updates form values correctly
- [ ] 6.5 Verify link to LLM settings page works
