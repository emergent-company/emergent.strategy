# Value Proposition Consolidation Script

## Purpose

The `consolidate-value-props.sh` script creates a single, comprehensive markdown document from all value proposition files and supporting documentation for the `add-emergent-product-hierarchy` change.

## Usage

```bash
# Generate with default output location
./scripts/consolidate-value-props.sh

# Generate with custom output location
./scripts/consolidate-value-props.sh /path/to/output.md
```

## Output

**Default location:** `openspec/changes/add-emergent-product-hierarchy/CONSOLIDATED.md`

The consolidated document includes:

1. **Executive Summary** - Completion status and overview
2. **Part 1: Change Proposal** - Proposal, design, and implementation tasks
3. **Part 2: Specification Deltas** - Landing page, product config, template pack specs
4. **Part 3: Value Propositions** - Core, Personal Assistant, Product Framework
5. **Part 4: Supporting Documentation** - Remaining Phase 1 tasks
6. **Appendices** - File structure, statistics, generation info

## Features

- ✅ **Table of Contents** - Auto-generated with anchor links
- ✅ **Source References** - Each section shows original file path
- ✅ **Statistics** - Word counts, page estimates, file counts
- ✅ **Metadata** - Generation timestamp, git commit, branch info
- ✅ **Regeneration Info** - Instructions for recreating document

## Use Cases

### Stakeholder Review

Share the consolidated document for comprehensive review without navigating multiple files:

```bash
./scripts/consolidate-value-props.sh
# Share: openspec/changes/add-emergent-product-hierarchy/CONSOLIDATED.md
```

### AI Agent Input

Provide the entire context to an AI agent in a single file:

```bash
./scripts/consolidate-value-props.sh /tmp/emergent-hierarchy.md
# Upload to AI agent for analysis or iteration
```

### Documentation Handoff

Create a snapshot for implementation teams or external stakeholders:

```bash
./scripts/consolidate-value-props.sh ./handoff/emergent-product-hierarchy-$(date +%Y%m%d).md
```

### Version Archival

Archive snapshots at key milestones:

```bash
./scripts/consolidate-value-props.sh ./archive/emergent-hierarchy-phase1-complete.md
```

## Output Statistics

Based on current documentation:

- **Total Lines:** ~4,300
- **Total Words:** ~26,750
- **File Size:** ~194KB
- **Estimated Pages:** ~53 (assuming 500 words/page)

## Source Files

The script consolidates these files:

```
openspec/
├── changes/add-emergent-product-hierarchy/
│   ├── proposal.md
│   ├── design.md
│   ├── tasks.md
│   ├── COMPLETION_STATUS.md
│   ├── PHASE_1_REMAINING.md
│   └── specs/
│       ├── landing-page/spec.md
│       ├── product-configuration/spec.md
│       └── template-packs/spec.md
└── specs/products/
    ├── core/value-proposition.md
    ├── personal-assistant/value-proposition.md
    └── product-framework/value-proposition.md
```

## Implementation Details

The script:

1. Creates a header with metadata and table of contents placeholder
2. Adds sections in order with source file references
3. Builds table of contents with anchor links
4. Appends appendices with file structure and statistics
5. Inserts table of contents after the header
6. Adds footer with generation info

Each section includes:

- Separator (`---`)
- Section heading
- Source file path reference
- Full contents of source file

## Error Handling

The script will:

- ✅ Warn about missing files (but continue)
- ✅ Create output directory if needed
- ✅ Show colorized progress messages
- ✅ Display final statistics and next steps

## Requirements

- Bash 4.0+
- Standard Unix utilities (cat, wc, find, awk, sed)
- Git (for commit/branch info in appendix)

## Maintenance

To add new sections to the consolidated document:

1. Edit `scripts/consolidate-value-props.sh`
2. Add `add_section` calls with title and file path
3. Add corresponding `add_toc_entry` calls for table of contents
4. Run script to test output

Example:

```bash
add_section "New Section Title" "$CHANGE_DIR/new-file.md" 2
add_toc_entry 2 "New Section Title" "new-section-title"
```

## Related Scripts

- `scripts/consolidate-value-props.sh` - This script (consolidate all value prop docs)
- Future: `scripts/generate-landing-page.sh` - Generate landing page from value props
- Future: `scripts/generate-pitch-deck.sh` - Generate pitch deck from value props

## License

Same as project (see root LICENSE file).
