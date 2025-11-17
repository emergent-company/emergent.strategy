# Change: Remove Speckit Tooling

## Why

Speckit was an earlier spec-driven development framework that has been superseded by OpenSpec. The project now uses OpenSpec exclusively for change proposals, specifications, and task management. Keeping speckit artifacts creates:

- Confusion about which system to use (speckit vs openspec)
- Maintenance burden for unused tooling and prompts
- Cluttered workspace with duplicate/obsolete workflows
- Risk of accidentally invoking deprecated commands

## What Changes

This change removes all speckit-related files, directories, and references:

- Remove `.specify/` directory containing templates, scripts, and memory
- Remove speckit prompt files from `.github/prompts/`
- Remove speckit command recommendations from VSCode settings
- Remove speckit references from documentation
- Clean up any remaining speckit mentions in code or comments

**BREAKING**: Any workflows or documentation referencing speckit commands (`/speckit.specify`, `/speckit.plan`, etc.) will no longer work. Users must transition to OpenSpec workflows.

## Impact

**Affected systems:**
- Developer workflow tooling
- AI assistant prompt configurations
- VSCode settings
- Documentation references

**Affected files/directories:**
- `.specify/` (entire directory)
- `.github/prompts/speckit.*.prompt.md` (8 files)
- `.vscode/settings.json` (chat.promptFilesRecommendations section)
- Various documentation files with speckit mentions

**Migration path:**
- Developers already using OpenSpec: No action needed
- Any remaining speckit-based workflows: Transition to `openspec` CLI commands
- AI assistants: Will automatically use openspec-* prompts instead

## Validation

After removal:
- Verify no broken references remain: `rg -i "speckit|\.specify" --type-not md`
- Confirm OpenSpec commands still work: `openspec list`, `openspec validate --strict`
- Check VSCode settings load without errors
- Ensure AI assistant prompts work correctly
