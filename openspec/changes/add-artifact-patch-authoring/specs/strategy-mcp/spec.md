## ADDED Requirements

### Requirement: Granular Artifact Editing Over MCP

The MCP server SHALL expose a `patch_artifact` tool that accepts JSON Pointer patches
for an artifact and stages the re-validated result for human review, giving external
and delegated agents the same granular editing capability as the web UI.

#### Scenario: Patch an artifact via MCP

- **WHEN** an agent calls `patch_artifact` with a valid patch set
- **THEN** the patches are applied in memory, the full payload is re-validated, and a
  batch is staged for human review
- **AND** the response carries the batch identifier and a review reference

#### Scenario: Structured errors, never raw Go errors

- **WHEN** a patch path is unresolvable or the resulting payload fails validation
- **THEN** the tool returns a structured error response identifying which patch failed
  and why

#### Scenario: The tool is reachable without prior filter configuration

- **WHEN** an MCP client opens a fresh session and lists tools without first calling
  `set_tool_filter`
- **THEN** `patch_artifact` is present in the listed tools and can be invoked

#### Scenario: The tool cannot commit

- **WHEN** an agent calls `patch_artifact`
- **THEN** the change is staged only, and applying it to current state still requires a
  separate, explicit commit
