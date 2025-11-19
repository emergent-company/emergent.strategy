# UI Components - Delta Spec

## ADDED Requirements

### Requirement: Organization-Aware Project Display

The project switcher component SHALL display the organization name as a subtitle for each project item to provide organizational context.

#### Scenario: Display organization name as subtitle

- **GIVEN** a user is viewing the project switcher dropdown
- **WHEN** the dropdown lists available projects
- **THEN** each project item SHALL display the project name as the main title
- **AND** the organization name SHALL be displayed as a subtitle below the project name
- **AND** the subtitle SHALL be styled with reduced opacity and smaller font size

#### Scenario: Handle long project names

- **GIVEN** a project has a name longer than the available display width
- **WHEN** the project item is rendered in the switcher
- **THEN** the project name SHALL be truncated with an ellipsis (...)
- **AND** hovering over the project name SHALL display the full project name in a tooltip

#### Scenario: Handle missing organization name

- **GIVEN** a project exists but its organization name is not available
- **WHEN** the project item is rendered in the switcher
- **THEN** the subtitle area SHALL be empty or display a neutral placeholder
- **AND** the project SHALL still be selectable

#### Scenario: Organization name lookup

- **GIVEN** each project has an associated `orgId`
- **WHEN** the project dropdown is rendered
- **THEN** the component SHALL look up the organization name using the `orgId`
- **AND** the lookup SHALL use the access tree context for data
- **AND** the organization name SHALL be passed to each project item

## REMOVED Requirements

### Requirement: Project Status Display

**Reason**: The "Active" status provided minimal value and is replaced by more meaningful organization context.

**Migration**: Replace status display with organization name. Components consuming `SidebarProjectItem` should pass `orgName` instead of relying on `project.status` for the subtitle.
