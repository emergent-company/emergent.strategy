# Tasks: Improve epf-cli AI Agent Feedback

## Phase 1: Structured Error Output

- [x] **1.1** Enhance `extractValidationErrors` in `validator.go` to parse JSON path from error
- [x] **1.2** Add `ValidationErrorEnhanced` struct with `Section`, `FieldPath`, `ExpectedType`, `ActualType`, `ExpectedStructure`
- [x] **1.3** Add `--ai-friendly` flag to `validate` command outputting YAML
- [x] **1.4** Group errors by top-level section in output
- [x] **1.5** Include expected structure snippet from schema for type mismatches
- [x] **1.6** Add `--json` flag for structured JSON output (complement to YAML)
- [x] **1.7** Add fix hints based on error type
- [x] **1.8** Add priority levels (critical, high, medium, low) to errors
- [x] **1.9** Fix path formatting bug (missing dots after array indexes)

## Phase 2: Fix Plan Generation

- [x] **2.1** Create `internal/fixplan/` package with `Generator` struct
- [x] **2.2** Implement error categorization: `critical` (type mismatch), `high` (enum/missing required), `medium` (length/constraints)
- [x] **2.3** Implement chunking logic based on section and error count
- [x] **2.4** Add `--fix-plan` flag to `validate` command
- [x] **2.5** Include template examples in fix plan when available
- [x] **2.6** Add estimated context size per chunk for AI agents

## Phase 3: Template Integration

- [x] **3.1** Add `--with-examples` flag to `schemas show` command
- [x] **3.2** Load corresponding template when showing schema section
- [x] **3.3** Extract relevant section from template for examples
- [x] **3.4** Implement `diff template` subcommand
- [x] **3.5** Show structural diff highlighting type mismatches
- [x] **3.6** Add "current file value" to schema show output when `--file` specified

## Phase 4: Incremental Validation

- [x] **4.1** Add `--section <path>` flag to validate command
- [x] **4.2** Implement YAML path-based extraction
- [x] **4.3** Validate only extracted section against schema subset
- [x] **4.4** Report success/failure for just that section
- [x] **4.5** Add `--continue-on-error` to validate multiple sections in one run

## Phase 5: MCP Tool Enhancements

- [x] **5.1** Add `epf_validate_with_plan` MCP tool returning structured fix plan
- [x] **5.2** Add `epf_get_section_example` MCP tool returning template example for a field path
- [x] **5.3** Add `epf_validate_section` MCP tool for incremental validation
- [x] **5.4** Update `epf_validate_file` to accept `ai_friendly` parameter

## Testing

- [x] **T1** Add unit tests for error path extraction
- [x] **T2** Add unit tests for fix plan generation and chunking
- [x] **T3** Add integration test with real failing EPF file
- [x] **T4** Test with Veilag instance as real-world validation

## Documentation

- [x] **D1** Update `epf-cli/AGENTS.md` with new AI-friendly flags
- [x] **D2** Add "Fixing Validation Errors" guide for AI agents
- [x] **D3** Document fix plan chunk sizing recommendations
