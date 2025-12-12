# Ad-Hoc Artifacts

This folder contains **non-authoritative documents** that are NOT part of the formal EPF structure.

## Purpose

Ad-hoc artifacts are ephemeral, convenience documents that:

- **Provide context** for EPF processes without being part of the schema
- **Capture AI-generated outputs** from ad-hoc user requests
- **Store user uploads** that inform EPF strategy but aren't formal artifacts
- **Facilitate communication** through derived content (memos, summaries, exports)

## Important Notes

⚠️ **These documents are not authoritative.** Always refer to the formal EPF artifacts in `READY/` and `FIRE/` for current strategy and feature definitions.

⚠️ **These documents may become outdated quickly.** They represent point-in-time outputs or context and should not be treated as living documents.

⚠️ **These documents don't follow EPF schemas.** They don't participate in traceability or validation processes.

## What Belongs Here

✅ **Roadmap exports** for external tools (ClickUp, Linear, Jira, etc.)  
✅ **Stakeholder communications** (memos, summaries, presentations)  
✅ **AI-generated analysis** from ad-hoc requests  
✅ **User-uploaded reference documents** for EPF to consider  
✅ **Executive summaries** of opportunities or strategies  
✅ **Partner/investor materials** derived from EPF content  
✅ **Team onboarding documents** explaining strategic context  

## What Does NOT Belong Here

❌ **Core EPF YAML files** → Use `READY/` for strategy artifacts  
❌ **Feature definitions** → Use `FIRE/feature_definitions/`  
❌ **Value models** → Use `FIRE/value_models/`  
❌ **Workflows** → Use `FIRE/workflows/`  
❌ **Code or implementation artifacts** → These belong in your codebase  
❌ **Meeting notes or general project docs** → Use your project management system  

## Naming Convention

Use **date-prefixed descriptive names** for chronological organization:

```
YYYY-MM-DD_descriptive_name.md
```

### Examples

- `2025-12-11_investor_materials_index.md`
- `2025-12-11_investor_memo_one_page_pitch.md`
- `2025-12-11_investor_memo_executive_summary.md`
- `2025-12-11_investor_memo.md`
- `2025-12-11_investor_faq.md`

## Use Cases

### 1. AI-Generated Roadmap Exports

When a user asks "Export this roadmap to ClickUp format", the AI can generate a markdown document here that translates EPF roadmap artifacts into tool-specific formats.

### 2. User-Uploaded Context Documents

Users can upload PDFs, Word docs, or other files here that provide market research, competitor analysis, or other context that should inform EPF strategy but don't fit formal schemas.

### 3. Stakeholder Communications

Generate executive summaries, investor updates, or team onboarding docs that synthesize EPF strategy in accessible formats for different audiences.

### 4. Ad-Hoc Analysis

When users request specific analysis ("Compare our positioning against competitors X, Y, Z"), the AI can generate dedicated documents here without polluting formal EPF artifacts.

## Git Considerations

**Recommendation:** Consider adding `ad-hoc-artifacts/` to `.gitignore` if these documents are:
- Regenerable from EPF artifacts
- Contain sensitive information
- Frequently changing/ephemeral

If these documents provide valuable historical context, you may choose to commit them, but be aware they'll create noise in your git history.

## Relationship to EPF Phases

```
EPF Structure                        Ad-Hoc Artifacts
─────────────────────────────────   ─────────────────────────────────
READY/                              NOT part of READY
  ├── Strategic planning             (May reference READY outputs)
  └── Authoritative                  
                                    
FIRE/                               NOT part of FIRE
  ├── Execution planning             (May reference FIRE outputs)
  └── Authoritative                  
                                    
AIM/                                NOT part of AIM
  ├── Learning/retrospectives        (May reference AIM insights)
  └── Authoritative                  
                                    
ad-hoc-artifacts/                   CONVENIENCE STORAGE
  ├── Derived content                (Ephemeral, non-authoritative)
  └── User uploads                   (Context, not traceability)
```

## Clean-Up Guidelines

Consider periodic review of this folder:

- **Monthly**: Archive or delete outdated exports and summaries
- **Quarterly**: Review uploaded reference docs for continued relevance
- **After major strategy pivots**: Clean out pre-pivot artifacts that no longer apply

Keep this folder lean to maintain focus on authoritative EPF artifacts.
