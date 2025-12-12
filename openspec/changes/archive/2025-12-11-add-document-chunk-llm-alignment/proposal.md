# Change: Add Document Chunk LLM Alignment

## Why

Document chunks (for storage/retrieval) and LLM extraction batch sizes (for processing) are currently configured independently with misaligned defaults. This creates suboptimal extraction results because:

1. Current document chunk defaults (~1,500 chars) are ~20x smaller than LLM batch defaults (~30,000 chars)
2. Users have no visibility into how these settings relate to each other
3. There's no guidance on optimal chunk sizes for extraction performance

A 1:4 ratio (document max chunk = LLM batch / 4) allows ~3-4 semantic document chunks per extraction batch, balancing context retention and processing consistency.

## What Changes

### Frontend (Document Processing Settings Page)

1. **Updated chunk size presets** - Align defaults with LLM settings:

   - Precise: 3,750 chars max / 1,500 min (aligns with LLM Conservative 15K)
   - Balanced: 7,500 chars max / 3,000 min (aligns with LLM Balanced 30K)
   - Comprehensive: 15,000 chars max / 6,000 min (aligns with LLM Aggressive 60K)

2. **Updated default configuration** - Change defaults from 1,200/100 to 7,500/3,000

3. **New "LLM Alignment" card** - Displays:

   - Current LLM batch size (linked to LLM settings page)
   - Suggested vs current chunk size comparison
   - Alignment status indicator (aligned/close/misaligned)
   - "Apply Suggested Settings" button when not aligned

4. **Updated input constraints** - Allow larger chunk sizes (max 25,000 chars)

5. **Preset cards show LLM alignment** - Each preset shows which LLM preset it aligns with

## Impact

- **Affected specs**: document-management
- **Affected code**:
  - `apps/admin/src/pages/admin/pages/settings/project/chunking.tsx` (main changes)
- **Breaking changes**: None (default values change, but existing saved configs unchanged)
- **User experience**: Improved guidance for optimal document processing settings
