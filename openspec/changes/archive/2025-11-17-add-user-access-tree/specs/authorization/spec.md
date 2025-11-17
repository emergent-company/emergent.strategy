## MODIFIED Requirements

### Requirement: Role-Based Membership Queries

The system SHALL support querying user memberships with role information for both organizations and projects.

#### Scenario: Organization membership with roles

- **WHEN** querying organization memberships for a user
- **THEN** system returns organization details (id, name) joined with membership role
- **AND** role values include org_admin, org_member, or other configured roles
- **AND** query uses INNER JOIN between kb.orgs and kb.organization_memberships

#### Scenario: Project membership with roles

- **WHEN** querying project memberships for a user
- **THEN** system returns project details (id, name, organizationId) joined with membership role
- **AND** role values include project_admin, project_member, or other configured roles
- **AND** query uses INNER JOIN between kb.projects and kb.project_memberships

#### Scenario: Cross-table membership aggregation

- **WHEN** building hierarchical access tree
- **THEN** system aggregates organization memberships and project memberships
- **AND** projects are grouped under their parent organizations
- **AND** membership roles are preserved at each level of hierarchy

### Requirement: Authorization Service Integration

The PermissionService SHALL continue to compute dynamic scopes based on organization and project memberships.

#### Scenario: Scope computation with access tree data

- **WHEN** PermissionService computes user permissions
- **THEN** service queries same membership tables used by access tree endpoint
- **AND** derived scopes match user's actual org/project access
- **AND** scope computation remains independent of access tree endpoint (no circular dependencies)

#### Scenario: Membership validation

- **WHEN** guards validate user access to specific org or project
- **THEN** validation uses membership tables as authoritative source
- **AND** access tree endpoint provides read-only view of same data
- **AND** creating/deleting memberships invalidates cached access tree data
