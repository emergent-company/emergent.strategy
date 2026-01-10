## ADDED Requirements

### Requirement: Data Sources Sidebar Section

The system SHALL provide a "Data Sources" section in the sidebar navigation that dynamically displays available content sources.

#### Scenario: Data Sources section displays in sidebar

- **WHEN** a user views the admin sidebar with a project selected
- **THEN** the sidebar SHALL display a "Data Sources" section
- **AND** the section SHALL appear below the project picker and above other project sections

#### Scenario: Documents item always visible

- **WHEN** a user views the Data Sources section
- **THEN** the section SHALL always display a "Documents" menu item
- **AND** the Documents menu item SHALL navigate to `/admin/data-sources/upload`
- **AND** the Documents item SHALL be visible regardless of whether uploaded documents exist

#### Scenario: Dynamic source type items

- **WHEN** documents exist with `source_type` values other than `'upload'`
- **THEN** the sidebar SHALL display menu items for each distinct source type
- **AND** each menu item SHALL use the display name from the source type plugin (e.g., "Emails" for `source_type: 'email'`)
- **AND** each menu item SHALL navigate to `/admin/data-sources/{sourceType}`

#### Scenario: Source type item visibility based on documents

- **WHEN** no documents exist with a particular `source_type`
- **THEN** that source type SHALL NOT appear in the sidebar
- **AND** when the first document of that type is created, the sidebar SHALL update to show the new item

#### Scenario: Data Sources section reflects active state

- **WHEN** a user navigates to any Data Sources page
- **THEN** the corresponding source type menu item SHALL be highlighted as active
- **AND** the "Data Sources" section SHALL remain expanded
