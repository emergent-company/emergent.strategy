## ADDED Requirements

### Requirement: Org-Grouped Sidebar Navigation

The web UI sidebar SHALL group strategies by their owning organisation. Each org
appears as a section header with its strategies listed underneath.

#### Scenario: Single org with multiple strategies
- **WHEN** the sidebar renders for a user whose workspaces all belong to one org
- **THEN** the org name appears as a section header
- **AND** all strategies are listed as links underneath that header

#### Scenario: Multiple orgs
- **WHEN** the sidebar renders for a user with workspaces in multiple orgs
- **THEN** each org appears as a separate section header
- **AND** strategies are grouped under their respective org
- **AND** orgs are ordered alphabetically by name

#### Scenario: Org name on dashboard cards
- **WHEN** the global dashboard renders instance cards
- **THEN** each card displays the owning org name
