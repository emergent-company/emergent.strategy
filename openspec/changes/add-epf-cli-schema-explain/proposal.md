# Change: Add Schema Explanation Commands to epf-cli

## Why

When `epf-cli health` reports schema validation errors like `missing properties: 'weakness'` or `expected object, but got string`, users (including AI agents) have no way to understand what the correct schema structure should be. They cannot see:

1. What fields are required vs optional
2. What the expected types are (string, array, object)
3. What enum values are allowed
4. Minimum string lengths

Without this information, fixing validation errors requires either:

- Guessing (error-prone)
- Access to the canonical EPF schemas (not available to most users)
- Trial and error (slow and frustrating)

This makes epf-cli unable to fulfill its purpose as a validation tool that enables users to fix their artifacts.

## What Changes

Add a `schemas show` subcommand that displays:

- Schema structure with required/optional annotations
- Field descriptions and types
- Nested structures expanded
- Example values where helpful

Add a `validate --explain` flag that:

- Shows validation errors WITH the expected schema structure
- Provides actionable guidance on how to fix each error
- Shows the line number or JSON path where the error occurred

## Impact

- Affected specs: None (epf-cli has no spec yet)
- Affected code: `apps/epf-cli/cmd/schemas.go`, `apps/epf-cli/cmd/validate.go`
- New capability: Users can self-serve schema understanding
- AI agents can fix validation errors without accessing canonical schemas
