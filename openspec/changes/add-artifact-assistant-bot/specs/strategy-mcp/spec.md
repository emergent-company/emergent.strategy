## ADDED Requirements

### Requirement: Artifact Patch MCP Tool

The MCP server SHALL expose a `patch_artifact` tool that accepts JSON Pointer patches
for an artifact and stages the re-validated result for human review, giving external
agents the same granular editing capability as the web UI.

#### Scenario: Patch artifact via MCP

- **WHEN** an agent calls `patch_artifact` with an artifact key and a set of patches
- **THEN** the patches are applied to the current payload, the result is re-validated,
  and a staged batch is created for human review

#### Scenario: Invalid path returns structured error

- **WHEN** a patch path does not resolve or the result fails validation
- **THEN** the tool returns a structured error response, not a raw Go error
