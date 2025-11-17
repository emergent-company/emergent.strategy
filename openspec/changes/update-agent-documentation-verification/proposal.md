# Change: Update Agent Documentation Verification

## Why

AI agents currently may rely on potentially outdated knowledge when creating proposals and implementing changes that involve external libraries, frameworks, or tools. This can lead to:

- Using deprecated APIs or patterns
- Missing new features or better approaches
- Implementing solutions that are no longer recommended
- Security vulnerabilities from outdated practices

The project already has Context7 MCP integration configured, which provides access to up-to-date documentation for external libraries. However, the OpenSpec workflow doesn't explicitly require agents to verify documentation freshness before making technical decisions.

Adding explicit documentation verification checkpoints ensures agents work with current information, reducing rework and improving solution quality.

## What Changes

- Update `openspec/AGENTS.md` to add documentation verification requirements in Stage 1 (Creating Changes) and Stage 2 (Implementing Changes)
- Add explicit step to use Context7 MCP for fetching latest documentation when proposals or implementations involve external libraries/frameworks
- Document when documentation verification is required vs optional
- Add verification checkpoints to the workflow before proposal creation and implementation start

## Impact

**Affected specs:**

- `openspec-workflow` (new capability) - defines requirements for AI agent workflow when using OpenSpec

**Affected code:**

- `openspec/AGENTS.md` - add documentation verification steps to Stage 1 and Stage 2 workflows
- `openspec/project.md` - optionally reference the documentation verification practice in conventions

**User-visible benefits:**

- Proposals and implementations use current best practices and APIs
- Reduced risk of using deprecated patterns or APIs
- Better alignment with library maintainers' recommendations
- Fewer bugs from outdated information

**Breaking changes:**

None - this is an enhancement to the agent workflow guidance, not a breaking change to the OpenSpec tooling or format.
