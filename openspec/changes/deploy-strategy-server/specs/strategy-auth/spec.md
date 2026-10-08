## ADDED Requirements

### Requirement: Deployed Production Environment

The system SHALL have a deployed production environment in which the
production safety guards are enforced against real configuration, not only
against unit tests and local binary runs.

The deployment SHALL set `ENV=production`, `AUTH_ENABLED=true`, and a complete
Zitadel configuration. `ZITADEL_DEBUG_TOKEN` SHALL NOT be set in any
production or staging configuration.

Cloud Run's platform-level `--allow-unauthenticated` SHALL NOT be interpreted
as permission to relax application-level authentication. The platform endpoint
is public because MCP clients authenticate with Bearer tokens the application
validates itself; the application's own auth remains mandatory.

#### Scenario: Correctly configured production start
- **WHEN** the service is deployed with `ENV=production`, `AUTH_ENABLED=true`, and Zitadel configured
- **THEN** the container starts
- **AND** `/health` returns 200
- **AND** the MCP endpoint requires a valid Bearer token

#### Scenario: Misconfigured production deploy is refused at boot
- **WHEN** the service is deployed with `ENV=production` and `AUTH_ENABLED=false`
- **THEN** the container exits non-zero before binding a listener
- **AND** the logs name the offending setting
- **AND** no unauthenticated endpoint is ever served

#### Scenario: Debug token is rejected in a deployed environment
- **WHEN** the service is deployed with `ENV=production` and `ZITADEL_DEBUG_TOKEN` set
- **THEN** the container exits non-zero before binding a listener
- **AND** the error message does not echo the token value

#### Scenario: Container port matches the platform route
- **WHEN** the service is deployed to Cloud Run
- **THEN** the platform's configured port matches the port the container listens on
- **AND** requests to the service URL reach the application rather than failing at the proxy

### Requirement: Scoped Token Access Over a Network Boundary

The system SHALL permit a holder of a scoped read-only access token to connect
a remote MCP client to the deployed service and exercise exactly the access
their grants describe, with no interactive login and no access to the host
network.

#### Scenario: External read-only token holder connects
- **WHEN** a token holder configures a remote MCP client with `Authorization: Bearer est_...`
- **THEN** `tools/list` responds over the network
- **AND** reads succeed on granted instances
- **AND** reads fail on non-granted instances
- **AND** write tools are denied regardless of whether their category is active

#### Scenario: Revocation takes effect against a live client
- **WHEN** a token is revoked while a remote client holds it
- **THEN** the next call from that client fails authentication
