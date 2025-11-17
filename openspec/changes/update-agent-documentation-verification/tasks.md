## 1. Update AGENTS.md Stage 1 Workflow

- [ ] 1.1 Add documentation verification step to Stage 1 "Before Any Task" checklist
- [ ] 1.2 Add new section "Documentation Verification" after "Before Any Task" section
- [ ] 1.3 Document when Context7 MCP verification is required vs optional
- [ ] 1.4 Provide example of using Context7 MCP tools (`context7_resolve-library-id`, `context7_get-library-docs`)

## 2. Update AGENTS.md Stage 2 Workflow

- [ ] 2.1 Add documentation re-verification step to Stage 2 workflow checklist
- [ ] 2.2 Insert verification step between "Read tasks.md" and "Implement tasks sequentially"
- [ ] 2.3 Add note about mandatory verification for changes with >7 day gap
- [ ] 2.4 Document how to handle breaking changes discovered during re-verification

## 3. Add Documentation Verification Examples

- [ ] 3.1 Create example workflow showing Context7 MCP usage for TypeORM documentation
- [ ] 3.2 Create example showing multi-library verification (TypeORM + NestJS)
- [ ] 3.3 Add example of fallback to WebFetch when Context7 doesn't have library
- [ ] 3.4 Document pattern for noting documentation source in proposals

## 4. Update Project Conventions (Optional)

- [ ] 4.1 Review if `project.md` should reference documentation verification practice
- [ ] 4.2 Add to "Best Practices" section if appropriate
- [ ] 4.3 Cross-reference AGENTS.md for detailed workflow

## 5. Create Spec for openspec-workflow Capability

- [ ] 5.1 Create `openspec/specs/openspec-workflow/spec.md` (during archival, not now)
- [ ] 5.2 Note: This will be created when archiving the change
- [ ] 5.3 Spec will define requirements for agent workflow with documentation verification

## 6. Validation

- [ ] 6.1 Run `openspec validate update-agent-documentation-verification --strict`
- [ ] 6.2 Verify all requirements have at least one scenario
- [ ] 6.3 Verify scenario formatting uses `#### Scenario:` headers
- [ ] 6.4 Fix any validation errors

## 7. Documentation

- [ ] 7.1 Ensure proposal.md clearly explains the why and impact
- [ ] 7.2 Verify tasks.md covers all implementation steps
- [ ] 7.3 Confirm change-id is unique and descriptive
- [ ] 7.4 Verify no design.md is needed (this is documentation/process update only)
