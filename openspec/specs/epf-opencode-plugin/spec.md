# epf-opencode-plugin Specification

## Purpose
TBD - created by archiving change add-epf-opencode-plugin. Update Purpose after archive.
## Requirements
### Requirement: Commit Guard

The plugin SHALL intercept `git commit` commands executed via OpenCode's bash tool and validate the EPF instance health before allowing the commit to proceed. If critical validation errors exist, the plugin SHALL block the commit and report the errors. If only warnings exist, the plugin SHALL allow the commit and display a toast notification with the warning count.

#### Scenario: Commit blocked due to critical EPF errors
- **WHEN** the agent executes a `git commit` command via the bash tool
- **AND** the EPF instance contains critical validation errors
- **THEN** the plugin blocks the commit by throwing an error
- **AND** the error message includes the number of critical errors and a suggestion to run `epf_dashboard`

#### Scenario: Commit allowed with warnings
- **WHEN** the agent executes a `git commit` command via the bash tool
- **AND** the EPF instance contains only warnings (no critical errors)
- **THEN** the plugin allows the commit to proceed
- **AND** a toast notification is shown with the warning count

#### Scenario: Commit proceeds when instance is healthy
- **WHEN** the agent executes a `git commit` command via the bash tool
- **AND** the EPF instance passes all validation checks
- **THEN** the plugin allows the commit to proceed silently

#### Scenario: Guard bypass with --no-verify
- **WHEN** the agent executes a `git commit --no-verify` command
- **THEN** the plugin skips the EPF health check and allows the commit

### Requirement: Session Idle Health Check

The plugin SHALL run an EPF instance health check when the agent session becomes idle and display a toast notification summarizing the instance status. The health check SHALL run at most once per session to avoid repeated notifications.

#### Scenario: Health toast on first idle
- **WHEN** the agent session becomes idle for the first time
- **AND** an EPF instance is detected in the workspace
- **THEN** the plugin runs `epf-cli health` and shows a toast with the health summary

#### Scenario: No repeated health toasts
- **WHEN** the agent session becomes idle for a subsequent time
- **THEN** the plugin does not run another health check or show another toast

### Requirement: File Edit Validation

The plugin SHALL detect when EPF YAML files are edited and trigger validation on the modified file. If validation errors are found, the plugin SHALL display a toast notification.

#### Scenario: EPF file edit triggers validation
- **WHEN** a file matching EPF artifact patterns (READY/, FIRE/, AIM/ directories) is edited
- **THEN** the plugin validates the file via `epf-cli validate`
- **AND** if errors are found, a toast notification is shown with the error summary

#### Scenario: Non-EPF file edit is ignored
- **WHEN** a file outside EPF directories is edited
- **THEN** the plugin takes no action

### Requirement: Diagnostic Aggregation

The plugin SHALL aggregate LSP diagnostics from EPF files across the workspace and emit a summary toast when the diagnostic count crosses a threshold.

#### Scenario: Diagnostic threshold toast
- **WHEN** EPF LSP diagnostics are received for workspace files
- **AND** the total number of files with errors exceeds a threshold
- **THEN** the plugin emits a toast summarizing the diagnostic state

### Requirement: EPF Dashboard Tool

The plugin SHALL provide a custom tool named `epf_dashboard` that returns a formatted markdown summary of the EPF instance health including structure validation, schema validation status, content readiness, and workflow guidance.

#### Scenario: Dashboard tool returns health overview
- **WHEN** the LLM calls the `epf_dashboard` tool
- **THEN** the plugin runs `epf-cli health` with JSON output
- **AND** formats the results as markdown tables
- **AND** returns the formatted output to the conversation

#### Scenario: Dashboard tool reports missing instance
- **WHEN** the LLM calls the `epf_dashboard` tool
- **AND** no EPF instance is detected in the workspace
- **THEN** the tool returns an error message indicating no EPF instance was found

### Requirement: Coverage Analysis Tool

The plugin SHALL provide a custom tool named `epf_coverage` that returns a formatted overview of value model coverage showing which L2 components have features contributing to them and identifying strategic gaps.

#### Scenario: Coverage tool returns value model coverage
- **WHEN** the LLM calls the `epf_coverage` tool
- **THEN** the plugin runs coverage analysis via `epf-cli`
- **AND** formats the results as a markdown overview grouped by track
- **AND** marks each L2 component as covered or uncovered

### Requirement: Roadmap Status Tool

The plugin SHALL provide a custom tool named `epf_roadmap_status` that returns OKR achievement rates, assumption validation status, and cycle trends from the EPF instance.

#### Scenario: Roadmap status tool returns OKR progress
- **WHEN** the LLM calls the `epf_roadmap_status` tool
- **THEN** the plugin runs OKR progress analysis via `epf-cli`
- **AND** formats achievement rates by track as markdown tables

### Requirement: Graceful Degradation

The plugin SHALL detect whether `epf-cli` is available on PATH at startup. If not available, the plugin SHALL log a warning and disable all guardrails and tools without crashing OpenCode.

#### Scenario: epf-cli not on PATH
- **WHEN** OpenCode loads the plugin
- **AND** `epf-cli` is not found on PATH
- **THEN** the plugin logs a warning message
- **AND** no hooks or tools are registered

#### Scenario: No EPF instance in workspace
- **WHEN** OpenCode loads the plugin
- **AND** `epf-cli` is on PATH but no EPF instance is found in the workspace
- **THEN** the plugin registers tools (they report "no instance found" on invocation)
- **AND** guardrail hooks are registered but skip execution when no instance is detected

### Requirement: Distribution

The plugin SHALL be distributable as an npm package and as local plugin files. It SHALL be installable by adding the package name to the OpenCode config `plugin` array or by placing the source files in the OpenCode plugins directory.

#### Scenario: Install via npm config
- **WHEN** a user adds `"opencode-epf"` to the `plugin` array in `opencode.json`
- **THEN** OpenCode installs and loads the plugin at startup

#### Scenario: Install via local files
- **WHEN** a user places the plugin files in `.opencode/plugins/` or `~/.config/opencode/plugins/`
- **THEN** OpenCode loads the plugin at startup

