# Bug Reports - README

This directory contains structured bug reports for issues discovered during development, testing, or production operation.

## Purpose

The `docs/bugs/` directory serves as a centralized location for documenting bugs, their investigation, and resolution. This helps:

- Track issues systematically
- Preserve investigation findings
- Enable knowledge sharing across team and AI agents
- Maintain historical context for resolved issues
- Facilitate prioritization and assignment

## For AI Coding Agents

When you discover a bug during your work:

1. **Create a new bug report** using the template: `docs/bugs/TEMPLATE.md`
2. **Naming convention:** `NNN-short-descriptive-title.md` (e.g., `001-zitadel-introspection-failures.md`)
3. **Fill in all relevant sections:**

   - Set appropriate severity: Critical / High / Medium / Low
   - Include log excerpts with timestamps
   - Document reproduction steps
   - Analyze impact on users and system
   - Propose investigation steps or solutions

4. **When to create a bug report:**

   - Errors in logs that indicate system malfunction
   - Failed tests or test suite issues
   - Unexpected behavior during feature development
   - Performance problems or resource issues
   - Security vulnerabilities
   - Configuration issues causing failures

5. **What NOT to report as bugs:**
   - Missing features (use `docs/improvements/` instead)
   - Enhancement requests (use `docs/improvements/` instead)
   - Questions or clarifications
   - Expected behavior or working features

## Bug Severity Guidelines

- **Critical:** System down, data loss, security breach, blocking all users
- **High:** Major functionality broken, affecting many users, no workaround
- **Medium:** Significant issue with workaround, affecting some users
- **Low:** Minor issue, cosmetic problems, affects few users

## File Structure

```
docs/bugs/
├── README.md                              # This file
├── TEMPLATE.md                            # Bug report template
├── 001-zitadel-introspection-failures.md  # Example bug report
├── 002-materialized-view-not-populated.md # Example bug report
└── 003-missing-google-api-key.md         # Example bug report
```

## Workflow

1. **Discovery:** Bug found during development, testing, or operation
2. **Documentation:** Create bug report using template
3. **Investigation:** Add findings to "Root Cause Analysis" section
4. **Resolution:** Document fix in "Proposed Solution"
5. **Testing:** Complete testing plan checklist
6. **Closure:** Update status to "Resolved" or "Closed" with final notes

## Tips for AI Agents

- **Be specific:** Include exact error messages, file paths with line numbers, and timestamps
- **Be thorough:** Fill in all template sections; mark sections as "Unknown" or "Under Investigation" if information is not available yet
- **Be helpful:** Propose investigation steps even if you don't know the solution
- **Link related issues:** Reference other bugs or improvements that are related
- **Update regularly:** If you make progress on a bug, update the report with new findings
- **Use the logs tool:** When documenting bugs, use the `logs` tool to retrieve recent log excerpts
- **Search first:** Before creating a new bug report, check if a similar issue already exists

## Active Critical Bugs

### Blocking Smart Extraction (2024-11-21)

- **[004-embedding-column-mismatch.md](./004-embedding-column-mismatch.md)** - Embedding worker writes to wrong column

  - Severity: Critical
  - Impact: 100% of graph objects have NULL embeddings for vector search
  - Status: Identified, solution designed
  - Blocks: Vector search, smart extraction, semantic chat

- **[003-chunk-embeddings-missing.md](./003-chunk-embeddings-missing.md)** - No embedding system for chunks
  - Severity: Critical
  - Impact: Architecture gap - no way to generate chunk embeddings
  - Status: Analysis complete, implementation needed
  - Blocks: Context-aware extraction, chunk-based search

## Examples of Good Bug Reports

See the existing bug reports in this directory:

- `001-zitadel-introspection-failures.md` - Authentication issue with external service
- `002-materialized-view-not-populated.md` - Database schema issue
- `004-embedding-column-mismatch.md` - Schema confusion causing data to be written to wrong column

These demonstrate the level of detail and structure expected.

---

**Note:** This directory is for bugs only. For feature requests and improvements, use `docs/improvements/`.
