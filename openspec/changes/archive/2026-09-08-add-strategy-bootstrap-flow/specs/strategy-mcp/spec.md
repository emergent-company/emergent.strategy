## ADDED Requirements

### Requirement: Lifecycle Mode Detection Covers the Full READY Set

<!-- Relocated 2026-09-08. This was written as a MODIFIED requirement against
     strategy-web, but no such requirement has ever existed in that capability and
     lifecycle detection is not a web concern: it is implemented in
     internal/mcpserver/lifecycle.go and surfaced through MCP next_steps. Recorded
     here as ADDED, against the capability that actually owns it. -->

The lifecycle mode detection SHALL check all 7 READY artifact types for the
`foundation` mode transition. When evidence items exist but READY artifacts are
placeholder-only, the system SHALL recommend the bootstrap flow.

#### Scenario: Evidence loaded but placeholder artifacts
- **WHEN** evidence items exist but READY artifacts contain only placeholders
- **THEN** the lifecycle mode is `foundation`
- **AND** next_steps recommend starting the bootstrap flow

#### Scenario: Complete foundation
- **WHEN** all 7 READY artifacts exist with substantive content and at least 1 feature exists
- **THEN** the lifecycle mode transitions to `building`
