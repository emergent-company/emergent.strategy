## ADDED Requirements

### Requirement: Docker Containerization

The system SHALL provide a Docker container image for deploying the EPF strategy server to cloud environments.

The container SHALL:

- Use a multi-stage build (Go build stage + minimal runtime stage)
- Embed all EPF canonical artifacts (schemas, templates, wizards, generators) at build time
- Expose a configurable port for HTTP/SSE connections
- Accept all configuration via environment variables

#### Scenario: Build container image

- **WHEN** the CI pipeline builds the Docker image
- **THEN** the image includes the compiled EPF CLI binary with embedded canonical artifacts
- **AND** the runtime image is based on a minimal base (distroless or alpine)
- **AND** the image size is under 50MB

#### Scenario: Container starts with environment configuration

- **WHEN** the container starts with environment variables `PORT=8080`, `GITHUB_APP_ID=12345`, `SOURCE_TYPE=github`
- **THEN** the EPF server starts on the specified port
- **AND** connects to GitHub using the configured App credentials
- **AND** begins serving MCP requests

### Requirement: GCP Cloud Run Deployment

The system SHALL support deployment to GCP Cloud Run with automated CI/CD.

The deployment SHALL:

- Push container images to GCP Artifact Registry
- Configure Cloud Run with appropriate scaling limits (min 0, max configurable)
- Mount secrets from GCP Secret Manager as environment variables
- Use the `/health` endpoint for Cloud Run health checks

#### Scenario: Automated deployment on merge

- **WHEN** code is merged to the main branch
- **AND** the deploy workflow is triggered
- **THEN** a new container image is built and pushed to Artifact Registry
- **AND** Cloud Run is updated with the new image revision
- **AND** traffic is gradually shifted to the new revision

#### Scenario: Scale to zero with no traffic

- **WHEN** no MCP client requests have been received for the configured idle period
- **THEN** Cloud Run scales the service to zero instances
- **AND** no compute costs are incurred during idle periods

#### Scenario: Cold start with cache warming

- **WHEN** the first request arrives after scale-to-zero
- **THEN** Cloud Run starts a new instance within 2 seconds
- **AND** the server loads the default EPF instance into cache
- **AND** the first MCP request is served within 3 seconds of arrival

### Requirement: Secret Management

The system SHALL store sensitive credentials in GCP Secret Manager, never in environment variables or code.

The secrets SHALL include:

- GitHub App private key (PEM format)
- Any API keys for MCP client authentication (if applicable)

#### Scenario: Secret loaded at startup

- **WHEN** the server starts on Cloud Run
- **AND** the `GITHUB_PRIVATE_KEY` environment variable references a Secret Manager path
- **THEN** the server resolves the secret from Secret Manager
- **AND** uses it for GitHub App JWT signing

#### Scenario: Secret rotation without redeployment

- **WHEN** the GitHub App private key is rotated in Secret Manager
- **AND** the secret version reference uses `latest`
- **THEN** new Cloud Run instances automatically pick up the rotated key
- **AND** existing instances continue using the previous key until recycled
