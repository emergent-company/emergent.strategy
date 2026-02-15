## ADDED Requirements

### Requirement: Automated Release Pipeline
The system SHALL produce cross-platform release binaries via CI/CD when a version tag is pushed.

#### Scenario: Tag triggers release
- **WHEN** a `v*` tag is pushed to `main`
- **THEN** GitHub Actions builds binaries for darwin/amd64, darwin/arm64, linux/amd64, linux/arm64, windows/amd64
- **AND** publishes them as a GitHub Release with SHA256 checksums

#### Scenario: CI runs on every push
- **WHEN** code is pushed or a PR is opened
- **THEN** the CI pipeline runs `go test ./...` and `go build`
- **AND** fails the PR if tests or build fail

### Requirement: Homebrew Distribution
The system SHALL be installable via Homebrew from a tap.

#### Scenario: Fresh install
- **WHEN** a user runs `brew install emergent-company/tap/epf-cli`
- **THEN** the latest release binary is downloaded and installed to the Homebrew prefix
- **AND** `epf-cli version` reports the correct version

#### Scenario: Upgrade
- **WHEN** a new version is released
- **AND** a user runs `brew upgrade epf-cli`
- **THEN** the binary is updated to the latest version

### Requirement: Update Notifications
The system SHALL notify users when a newer version is available.

#### Scenario: Newer version available
- **WHEN** a user runs any `epf-cli` command
- **AND** the installed version is older than the latest GitHub Release
- **AND** the last check was more than 24 hours ago
- **THEN** a notice is printed to stderr with the new version number and upgrade instructions

#### Scenario: Update check disabled
- **WHEN** `EPF_CLI_NO_UPDATE_CHECK=1` is set or `update_check: false` is in config
- **THEN** no update check is performed

#### Scenario: Self-update
- **WHEN** a user runs `epf-cli update`
- **THEN** the latest binary is downloaded from GitHub Releases and replaces the current binary
- **AND** if installed via Homebrew, the user is told to use `brew upgrade` instead
