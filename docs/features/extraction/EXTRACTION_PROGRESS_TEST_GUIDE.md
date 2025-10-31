# Extraction Progress Tracking - Test Guide

## What Was Fixed (October 18, 2025)

### ✅ Issue 1: Database Migration Applied
Added 4 progress tracking columns to `kb.object_extraction_jobs`:
- `total_items` - Total entities to process
- `processed_items` - Entities processed so far  
- `successful_items` - Entities successfully created
- `failed_items` - Entities that failed to create

### ✅ Issue 2: Key Generation Fixed
Added automatic key generation when `business_key` is null:
- Normalizes entity name (lowercase, alphanumeric + hyphens)
- Adds type prefix to avoid collisions
- Appends hash suffix for uniqueness
- Example: `name="Sweden"`, `type="Location"` → `location-sweden-abc12345`

## Step-by-Step Testing Instructions

### Test 1: Verify Progress Tracking UI (NEW!)

1. **Navigate to Admin Dashboard**
   - Open browser to http://localhost:5175/admin
   - Go to "Extraction Jobs" page

2. **Start a New Extraction**
   - Click "Documents" in sidebar
   - Find a document (e.g., "meeting_1.md")
   - Click the "Extract" button
   - Select entity types (Location, Meeting, Decision, etc.)
   - Click "Start Extraction"

3. **Watch Progress in Real-Time**
   - You'll be redirected to the job detail page
   - **NEW BEHAVIOR - Check these metrics update:**
     - ✅ "Processing Progress: X%" (should go from 0% → 100%)
     - ✅ "(X / Y)" showing processed vs total entities
     - ✅ "Items remaining: N" (should decrease from Y → 0)
     - ✅ "Throughput: X.X items/min" (should show actual rate)
     - ✅ "Estimated completion: Xs" or "Xm Ys" (should update based on throughput)
     - ✅ "Success rate: X%" (should show percentage of successful creations)

4. **Expected Timeline** (for 5-10 entities):
   - 0-2 seconds: Job starts, shows "Collecting data..."
   - 2-15 seconds: LLM extraction runs
   - 15-20 seconds: Entities processed, progress bar updates
   - 20 seconds: Job completes, shows final stats

### Test 2: Verify Entity Creation (KEY FIX!)

1. **Check Job Completion**
   - After extraction completes, check the "Statistics" section
   - **Expected**: "Total Items: N" (where N > 0, e.g., 5)
   - **Expected**: "Objects Created: N" (should match or be close to Total Items)
   - **FIXED**: Previously showed "Objects Created: 0" due to null key error

2. **Verify Objects Were Created**
   - Click "Objects" in the sidebar
   - **Expected**: See newly created objects
   - **Expected**: Object keys follow pattern: `{type}-{name}-{hash}`
     - Example: `location-sweden-a1b2c3d4`
     - Example: `person-john-doe-e5f6g7h8`

3. **Check Object Details**
   - Click on one of the created objects
   - **Expected**: See entity properties (name, description, confidence, etc.)
   - **Expected**: See extraction metadata (_extraction_source, _extraction_job_id, etc.)

### Test 3: Edge Cases

**Test Empty Result:**
1. Extract from a document with no matching entity types
2. **Expected**: Progress shows 0 / 0, completes instantly
3. **Expected**: No error, just "0 objects created"

**Test Large Batch:**
1. Extract from a long document (> 10 pages)
2. **Expected**: Progress updates smoothly throughout
3. **Expected**: Throughput shows reasonable rate (0.5-5 items/min)

**Test Multiple Entity Types:**
1. Select 4-5 different entity types (Location, Person, Organization, etc.)
2. **Expected**: All types get created successfully
3. **Expected**: Each has appropriate key prefix

## Verification Checklist

### Before Testing
- [x] Database migration applied (4 columns added)
- [x] Server restarted (key generation code loaded)
- [x] Admin frontend restarted (progress UI active)

### During Testing
- [ ] Progress bar moves from 0% → 100%
- [ ] Entity counts update (X / Y)
- [ ] Throughput calculates (items/min)
- [ ] Estimated completion shows time remaining
- [ ] Success rate shows percentage

### After Extraction
- [ ] Objects created > 0 (not 0 like before!)
- [ ] Objects appear in Objects list
- [ ] Object keys follow pattern: `{type}-{name}-{hash}`
- [ ] No "null value in column 'key'" errors in logs

## Troubleshooting

### If Progress Still Shows "0 / 0"
1. Check browser console for errors
2. Refresh the job detail page
3. Verify migration ran: `SELECT total_items FROM kb.object_extraction_jobs LIMIT 1`

### If Objects Still Not Created
1. Check server logs: `npm run workspace:logs`
2. Look for errors containing "graph_objects" or "key"
3. Check if job debug_info shows entity outcomes

### If Keys Look Wrong
1. Check the generated keys match pattern: `{type}-{normalized-name}-{hash}`
2. Verify hash is 8 characters
3. Check total key length is ≤ 128 characters

## Success Criteria

✅ **Migration Success**: All 4 progress columns exist with default value 0
✅ **Key Generation Success**: No "null value in column 'key'" errors
✅ **Progress Tracking Success**: UI shows real-time progress during extraction
✅ **Entity Creation Success**: Objects created > 0, visible in Objects page

## Next Steps After Testing

If successful:
1. Mark Issue 1 and Issue 2 as CLOSED
2. Update EXTRACTION_PROGRESS_TRACKING_ISSUES.md with test results
3. Consider adding E2E test for progress tracking

If issues found:
1. Document the error in EXTRACTION_PROGRESS_TRACKING_ISSUES.md
2. Check server logs for detailed stack traces
3. Verify database state matches expectations
