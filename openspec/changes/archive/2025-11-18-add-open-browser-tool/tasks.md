# Implementation Tasks: Add Open Browser Tool

## Planning & Design

- [x] Review existing tool implementations (credentials.ts, logs.ts)
- [x] Confirm tool API and return format
- [x] Verify Chrome debug script behavior with URL parameter

## Implementation

- [x] Create `.opencode/tool/open-browser.ts` with OpenCode tool structure
- [x] Implement .env file reading for ADMIN_PORT and credentials
- [x] Add URL construction logic (http://localhost:${ADMIN_PORT})
- [x] Add Chrome launch logic using child_process to invoke npm script
- [x] Format output with credentials and instructions
- [x] Add error handling for missing .env file
- [x] Add error handling for Chrome script failures

## Testing

- [x] Test with default ADMIN_PORT (5176)
- [x] Test with custom ADMIN_PORT in .env
- [x] Test with missing .env file (should show helpful error)
- [x] Test with Chrome already running (script handles this)
- [x] Verify credentials display correctly
- [x] Verify browser opens to correct URL
- [x] Test AI assistant can discover and invoke the tool

## Documentation

- [x] Update `.opencode/instructions.md` Section 4 with new tool
- [x] Add usage examples to instructions
- [x] Document tool in README (if needed)

## Validation

- [x] Run `openspec validate add-open-browser-tool --strict`
- [x] Fix any validation issues
- [x] Request proposal approval before implementation

## Completion Criteria

All tasks must be marked `[x]` before the change is considered complete.
