# Change: Improve epf-cli AI Agent Guidance and EPF Discovery

## Why

When AI agents (OpenCode, GitHub Copilot, Claude, etc.) work with repositories that contain EPF artifacts, they currently have no clear direction to use epf-cli as the authoritative toolkit. This leads to:

1. **Guesswork** - AI agents try to figure out EPF structure on their own, leading to invalid artifacts
2. **Inconsistent behavior** - Different AI sessions may interpret EPF differently
3. **Discovery failures** - Simple pattern matching for "epf" directories can match false positives
4. **No bootstrap path** - AI agents cannot reliably create a new EPF instance or repair a broken one

The epf-cli should serve as the **normative authority** for EPF operations, providing crystal-clear guidance that any AI agent can follow.

## What Changes

### 1. EPF Anchor File (`_epf.yaml`)

- **NEW** anchor file that identifies a valid EPF directory
- Located at `docs/epf/_epf.yaml` (required for valid EPF instances)
- Contains version, instance metadata, and AI agent instructions pointer
- Distinguishes real EPF directories from coincidentally-named directories

### 2. AI Agent Welcome Banner

- **NEW** `epf-cli agent` command that outputs structured AI-friendly instructions
- Banner explains epf-cli is the source of truth for EPF operations
- Lists available commands with descriptions
- Points to MCP server for programmatic access
- Outputs in both human-readable and JSON formats

### 3. Robust EPF Discovery (`epf-cli locate`)

- **NEW** command to discover EPF directories in a repository
- Validates presence of anchor file (`_epf.yaml`)
- Reports discovery confidence (valid, broken, candidate, not-found)
- Provides repair suggestions for broken instances

### 4. Enhanced `epf-cli init`

- **MODIFIED** to create anchor file automatically
- Interactive mode asks questions to bootstrap EPF
- Creates minimal valid structure with anchor file
- Outputs AI agent instructions after initialization

### 5. Health Check Integration

- **MODIFIED** `epf-cli health` to check for anchor file presence
- Warns if anchor file is missing (legacy instance)
- Provides migration path for legacy instances

## Impact

- **Affected specs**: epf-cli (new capability)
- **Affected code**:
  - `apps/epf-cli/cmd/agent.go` - New command
  - `apps/epf-cli/cmd/locate.go` - New command
  - `apps/epf-cli/cmd/init.go` - Enhanced initialization
  - `apps/epf-cli/cmd/health.go` - Anchor validation
  - `apps/epf-cli/internal/discovery/` - New discovery module
- **Backward compatibility**: Existing EPF instances work but show warnings about missing anchor

## Success Criteria

1. AI agents running `epf-cli agent` receive clear, actionable instructions
2. `epf-cli locate` correctly identifies EPF directories with 100% accuracy (no false positives)
3. Broken EPF instances are detected and repair guidance is provided
4. New EPF instances created via `epf-cli init` include anchor file
5. Legacy instances can be migrated with `epf-cli migrate-anchor`
