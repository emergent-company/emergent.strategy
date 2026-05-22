## MODIFIED Requirements

### Requirement: Post-Commit Ripple Pipeline

The post-commit ripple pipeline SHALL be implemented as a shared function
callable from both the MCP `commit_batch` tool and the web UI commit handler.
The pipeline SHALL include signal auto-resolution, structural analysis,
semantic classification, foundation draft enqueuing, and convergence loop
execution. The pipeline SHALL NOT be embedded in MCP-specific code.

#### Scenario: Pipeline called from MCP commit
- **WHEN** a batch is committed via the MCP `commit_batch` tool
- **THEN** the shared post-commit pipeline runs
- **AND** results are included in the MCP response (convergence_summary, validation_warnings)

#### Scenario: Pipeline called from web UI commit
- **WHEN** a batch is committed via the web UI draft review page
- **THEN** the same shared post-commit pipeline runs
- **AND** ripple signals are created and auto-resolved identically to the MCP path
- **AND** adapt-foundations is triggered when conditions are met

#### Scenario: Pipeline dependencies
- **WHEN** the pipeline runs
- **THEN** it receives explicit dependencies (ripple service, skill executor, orchestration engine, Memory client)
- **AND** does not depend on MCP-specific service bundles
