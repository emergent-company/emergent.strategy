# Improvement Suggestion: Batch Upload UX Enhancements

**Status:** Proposed  
**Priority:** Medium  
**Category:** UX / Developer Experience  
**Proposed:** 2025-12-03  
**Proposed by:** AI Agent  
**Assigned to:** Unassigned

---

## Summary

Enhance the multi-document batch upload feature with pre-upload validation UI, upload cancellation support, frontend unit tests, and API documentation.

---

## Current State

The batch upload feature is implemented and functional:

- Backend: `POST /api/ingest/upload-batch` endpoint with max 100 files per batch
- Frontend: Multi-file selection, drag-drop, progress UI with per-file status
- Testing: Unit tests (20 passing), API e2e tests (6 passing), Playwright e2e tests (written)
- Documentation: Swagger/OpenAPI documentation in place

**Current limitations:**

1. No client-side validation before upload starts - invalid files are only caught after upload begins
2. No ability to cancel an in-progress batch upload
3. No frontend unit tests for the batch upload UI components
4. No standalone API documentation with examples beyond Swagger

---

## Proposed Improvements

### 2.5 Pre-Upload Validation UI

Add client-side validation before the upload begins:

- Validate each file against type/size limits (10MB per file, accepted extensions)
- Show inline errors for invalid files with clear messaging
- Allow users to remove individual files from the queue before upload starts
- Display file size and type for each queued file

**Location:** `apps/admin/src/pages/admin/apps/documents/index.tsx`

### 2.6 Upload Cancellation Support

Enable users to cancel batch uploads in progress:

- Track `AbortController` for the batch request
- Add "Cancel All" button visible during upload
- Clean up UI state on cancellation (reset progress, show partial results)
- Handle partial success gracefully when cancelled mid-batch

**Location:** `apps/admin/src/pages/admin/apps/documents/index.tsx`

### 3.3 Frontend Unit Tests for Batch Upload UI

Add comprehensive unit tests for batch upload components:

- Test multi-file selection updates the queue correctly
- Test progress component renders per-file status accurately
- Test validation errors display correctly
- Test cancellation behavior

**Location:** `apps/admin/tests/unit/pages/documents/batch-upload.spec.tsx` (new file)

### 4.1 & 4.2 API Documentation

Enhance documentation for the batch upload endpoint:

- Add standalone API documentation with curl examples
- Add user guide section explaining batch upload workflow
- Include error handling examples and troubleshooting tips

**Location:** `docs/features/` or `docs/guides/`

---

## Benefits

- **User Benefits:**

  - Faster feedback on invalid files before upload
  - Ability to cancel long-running uploads
  - Clearer understanding of file requirements

- **Developer Benefits:**

  - Better test coverage for frontend components
  - Comprehensive API documentation for integration

- **System Benefits:**
  - Reduced wasted bandwidth from invalid file uploads
  - Better resource management with cancellation support

---

## Implementation Approach

### Pre-Upload Validation (2.5)

1. Extract validation logic to reusable function
2. Add validation state to track per-file validity
3. Add UI to display validation errors and remove invalid files
4. Only enable upload button when all files are valid

**Estimated Effort:** Small

### Upload Cancellation (2.6)

1. Create `AbortController` when batch upload starts
2. Pass signal to fetch request
3. Add cancel button to progress UI
4. Handle abort event to clean up state
5. Display partial results if cancelled mid-upload

**Estimated Effort:** Small

### Frontend Unit Tests (3.3)

1. Set up test file with React Testing Library
2. Mock API responses for batch upload
3. Test file selection, validation, progress, and completion flows
4. Add tests for edge cases (empty files, max limit, etc.)

**Estimated Effort:** Medium

### API Documentation (4.1 & 4.2)

1. Create markdown documentation with examples
2. Include curl commands for batch upload
3. Document error responses and handling
4. Add to user guides if they exist

**Estimated Effort:** Small

---

## Affected Components

- `apps/admin/src/pages/admin/apps/documents/index.tsx`
- `apps/admin/tests/unit/` (new test files)
- `docs/features/` or `docs/guides/` (new documentation)

---

## Risks & Considerations

- **Breaking Changes:** No
- **Performance Impact:** Neutral to Positive (validation reduces failed uploads)
- **Security Impact:** Neutral
- **Dependencies:** None
- **Migration Required:** No

---

## Success Metrics

- Pre-upload validation catches 100% of invalid files before upload starts
- Users can successfully cancel uploads without UI errors
- Frontend test coverage for batch upload components > 80%
- API documentation includes working curl examples

---

## Testing Strategy

- [ ] Unit tests for validation logic
- [ ] Unit tests for batch upload UI components (3.3)
- [ ] Integration tests for cancellation flow
- [ ] Manual testing for UX improvements

---

## Related Items

- Implements remaining tasks from: `openspec/changes/add-multi-document-upload/tasks.md`
- Tasks 2.5, 2.6, 3.3, 4.1, 4.2

---

## References

- Original feature spec: `openspec/changes/add-multi-document-upload/`
- Backend implementation: `apps/server/src/modules/ingestion/ingestion.controller.ts`
- Frontend implementation: `apps/admin/src/pages/admin/apps/documents/index.tsx`

---

## Notes

These are enhancement tasks that improve the UX and maintainability of the batch upload feature. The core functionality is complete and working. These improvements can be implemented incrementally as time permits.

Priority order suggestion:

1. **2.5 Pre-Upload Validation** - Highest user value, prevents frustration
2. **2.6 Cancellation Support** - Important for large batches
3. **3.3 Frontend Tests** - Important for maintainability
4. **4.1-4.2 Documentation** - Can be done anytime

---

**Last Updated:** 2025-12-03 by AI Agent
