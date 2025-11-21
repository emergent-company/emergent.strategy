# mdbible Source Attribution

The Bible markdown files in this directory are from the [mdbible repository](https://github.com/lguenth/mdbible.git) created by lguenth.

**Source:** https://github.com/lguenth/mdbible  
**Version:** English Standard Version (ESV)  
**Format:** Markdown with verse numbers  
**License:** See original repository for licensing details

## Structure

- **Books:** 66 files (Old and New Testament)
- **Format:**
  - Book titles as H1 headings
  - Chapters as H2 headings
  - Verses numbered sequentially
- **Naming:** Files prefixed with book order (e.g., `01_Genesis.md`, `40_Matthew.md`)

## Purpose

These files serve as test data for:

- Document ingestion and chunking
- Semantic search across interconnected content
- Entity extraction (people, places, events)
- Graph relationship mapping
- Full-text search validation

## Usage

Use the `scripts/seed-bible-documents.ts` script to upload these files to a project:

```bash
npm run seed:bible -- --project-id=<project-uuid>
```

See the main documentation in `docs/testing/bible-dataset.md` for complete instructions.
