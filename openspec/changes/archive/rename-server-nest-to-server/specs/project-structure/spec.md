## MODIFIED Requirements

### Requirement: Application Naming Convention

Application names in the monorepo SHALL use simple, descriptive names without technology-specific suffixes unless disambiguation is required.

#### Scenario: Backend application naming

- **GIVEN** a NestJS backend application in the monorepo
- **AND** no other backend implementations exist requiring disambiguation
- **WHEN** referencing the application in configuration and commands
- **THEN** use the name "server" without technology suffixes
- **AND** the application directory is `apps/server/`
- **AND** Nx commands reference it as `nx run server:<target>`
- **AND** package name is `"server"` in package.json

#### Scenario: Application directory structure

- **GIVEN** applications in the Nx monorepo workspace
- **WHEN** organizing application directories
- **THEN** place each application in `apps/<app-name>/` where `<app-name>` is a simple descriptive name
- **AND** the admin frontend is located at `apps/admin/`
- **AND** the backend server is located at `apps/server/`
- **AND** directory names match Nx project names and package.json names

## REMOVED Requirements

### Requirement: Technology-Suffixed Application Names

**Reason**: Technology suffixes (e.g., "-nest") are redundant when only one implementation of a given application type exists. They add verbosity without providing meaningful disambiguation.

**Migration**: Rename `apps/server-nest/` to `apps/server/` and update all references in configuration files, documentation, and source code.

The removed pattern was:
- Directory: `apps/server-nest/`
- Nx project name: `server-nest`
- Package name: `"server-nest"`
- Commands: `nx run server-nest:<target>`

This is replaced with the simplified naming convention specified in the MODIFIED requirement above.
