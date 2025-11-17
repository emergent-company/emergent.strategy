## 1. Update AGENTS.md Stage 1 Workflow

- [x] 1.1 Add documentation verification step to Stage 1 "Before Any Task" checklist
- [x] 1.2 Add new section "Documentation Verification" after "Before Any Task" section
- [x] 1.3 Document when Context7 MCP verification is required vs optional
- [x] 1.4 Provide example of using Context7 MCP tools (`context7_resolve-library-id`, `context7_get-library-docs`)

## 2. Update AGENTS.md Stage 2 Workflow - Documentation Re-verification

- [x] 2.1 Add documentation re-verification step to Stage 2 workflow checklist
- [x] 2.2 Insert verification step between "Read tasks.md" and "Implement tasks sequentially"
- [x] 2.3 Add note about mandatory verification for changes with >7 day gap
- [x] 2.4 Document how to handle breaking changes discovered during re-verification

## 3. Update AGENTS.md Stage 2 Workflow - Test Baseline Verification

- [x] 3.1 Add pre-implementation test verification step to Stage 2 workflow
- [x] 3.2 Insert test verification step before implementation starts
- [x] 3.3 Document which tests to run based on change scope (unit vs E2E, server vs admin)
- [x] 3.4 Add guidance on handling failing tests (ask user before proceeding)
- [x] 3.5 Provide examples: `nx run server:test`, `nx run admin:test`, `nx run server:test-e2e`, `nx run admin:e2e`

## 4. Update AGENTS.md Stage 2 Workflow - Post-Implementation Verification

- [x] 4.1 Add mandatory post-implementation verification step to Stage 2 workflow
- [x] 4.2 Document required sequence: build → lint → tests
- [x] 4.3 Specify commands for different project scopes (server-only, admin-only, full-stack)
- [x] 4.4 Add guidance on fixing build errors, lint errors, and test failures
- [x] 4.5 Provide examples: `npm run build`, `nx run server:build`, `nx run admin:build`, `nx run server:lint`, `nx run admin:lint`
- [x] 4.6 Document that all verification must pass before marking change complete

## 5. Update AGENTS.md Stage 2 Workflow - Manual Testing with DevTools MCP

- [x] 5.1 Add pre-test verification step using Chrome DevTools MCP to Stage 2 workflow
- [x] 5.2 Document workflow: start Chrome debug → get test credentials → manual testing → gather selectors
- [x] 5.3 Add guidance on using DevTools MCP tools (take_snapshot, list_network_requests, list_console_messages, evaluate_script)
- [x] 5.4 Document how to extract test inputs (selectors, element attributes, API endpoints)
- [x] 5.5 Provide example of gathering selectors before writing Playwright tests
- [x] 5.6 Add guidance on verifying user flows manually before automating them
- [x] 5.7 Document test credential retrieval with `./scripts/get-test-user-credentials.sh`

## 6. Create Test User Credentials Script

- [x] 6.1 Create `scripts/get-test-user-credentials.sh` based on bootstrap script
- [x] 6.2 Script should load TEST_USER_EMAIL and TEST_USER_PASSWORD from .env
- [x] 6.3 Display credentials, application URLs, and testing instructions
- [x] 6.4 Make script executable: `chmod +x scripts/get-test-user-credentials.sh`
- [x] 6.5 Test script runs successfully and displays correct information

## 7. Add Documentation Verification Examples

- [x] 7.1 Create example workflow showing Context7 MCP usage for TypeORM documentation
- [x] 7.2 Create example showing multi-library verification (TypeORM + NestJS)
- [x] 7.3 Add example of fallback to WebFetch when Context7 doesn't have library
- [x] 7.4 Document pattern for noting documentation source in proposals
- [x] 7.5 Add example of DevTools MCP workflow for gathering test selectors

## 8. Update Project Conventions (Optional)

- [x] 8.1 Review if `project.md` should reference documentation verification practice
- [x] 8.2 Add to "Best Practices" section if appropriate
- [x] 8.3 Cross-reference AGENTS.md for detailed workflow

## 9. Create Spec for openspec-workflow Capability

- [x] 9.1 Create `openspec/specs/openspec-workflow/spec.md` (during archival, not now)
- [x] 9.2 Note: This will be created when archiving the change
- [x] 9.3 Spec will define requirements for agent workflow with all verification steps

## 10. Validation

- [x] 10.1 Run `openspec validate update-agent-documentation-verification --strict`
- [x] 10.2 Verify all requirements have at least one scenario
- [x] 10.3 Verify scenario formatting uses `#### Scenario:` headers
- [x] 10.4 Fix any validation errors

## 11. Documentation

- [x] 11.1 Ensure proposal.md clearly explains the why and impact
- [x] 11.2 Verify tasks.md covers all implementation steps
- [x] 11.3 Confirm change-id is unique and descriptive
- [x] 11.4 Verify no design.md is needed (this is documentation/process update only)
- [x] 11.5 Update README or testing docs to reference new test credentials script
