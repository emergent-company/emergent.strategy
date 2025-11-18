# E2E Test Archive

This directory contains test files that are not meant to run in CI but may be useful for reference or debugging.

## Archived Tests

### debug-direct-admin.spec.ts

**Purpose:** Debug test for investigating direct navigation to admin pages  
**Why archived:** Development/debugging only, not for CI  
**Usage:** Can be temporarily moved back to `specs/` for debugging navigation issues

### template.new-view.spec.ts

**Purpose:** Template for creating new route-visit tests  
**Why archived:** Template only, not an actual test  
**Usage:** Copy to `specs/` and customize when adding tests for new routes

## Using Archived Tests

To use an archived test:

1. Copy (don't move) the file from `archive/` to `specs/`
2. Update the relative imports (change `../../` to `../`)
3. Customize as needed
4. Delete when done (for debug tests) or commit (for new feature tests)

## Note

These files are kept with corrected imports so they don't break the test runner when it scans all `.spec.ts` files in subdirectories.
