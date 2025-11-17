# MCP Integration - Spec Delta

## ADDED Requirements

### Requirement: Claude Context MCP Server

The system SHALL provide claude-context MCP server integration to enable semantic code search across the codebase using natural language queries.

#### Scenario: OpenCode configuration

- **WHEN** a developer uses OpenCode as their AI coding assistant
- **THEN** the `.vscode/mcp.json` file SHALL include a claude-context server configuration
- **AND** the configuration SHALL map MILVUS\_\* environment variables to claude-context expected variables
- **AND** the configuration SHALL set EMBEDDING_PROVIDER from MILVUS_EMBEDDING_PROVIDER
- **AND** the configuration SHALL set GEMINI_API_KEY from MILVUS_GEMINI_API_KEY
- **AND** the server SHALL use the latest @zilliz/claude-context-mcp package

#### Scenario: GitHub Copilot configuration

- **WHEN** a developer uses GitHub Copilot with MCP support
- **THEN** the `.github/.copilot/mcp.json` file SHALL provide claude-context server configuration
- **AND** the configuration SHALL map MILVUS\_\* environment variables appropriately
- **AND** the configuration SHALL follow GitHub Copilot's MCP JSON schema
- **AND** environment variables SHALL be documented in setup instructions

#### Scenario: Gemini CLI configuration

- **WHEN** a developer uses Gemini CLI as their AI coding assistant
- **THEN** a `.gemini/settings.json` template SHALL be provided
- **AND** the template SHALL include claude-context server configuration with MILVUS\_\* variable mapping
- **AND** the template SHALL be excluded from version control (user-specific)

### Requirement: Environment Variable Configuration with MILVUS Prefix

The system SHALL provide environment variable templates for claude-context MCP authentication and connection using MILVUS\_ prefix to avoid conflicts with existing server embedding configuration.

#### Scenario: MILVUS-prefixed variable naming

- **WHEN** setting up claude-context MCP environment variables
- **THEN** all claude-context configuration SHALL use MILVUS\_ prefix
- **AND** variables SHALL include MILVUS_EMBEDDING_PROVIDER, MILVUS_GEMINI_API_KEY, MILVUS_EMBEDDING_MODEL, MILVUS_ADDRESS
- **AND** documentation SHALL explain that MILVUS\_ prefix separates claude-context config from server's Vertex AI config
- **AND** the server SHALL continue using VERTEX*EMBEDDING*\* variables without conflict

#### Scenario: Google Gemini API configuration for claude-context

- **WHEN** setting up claude-context MCP
- **THEN** the `.env.example` file SHALL include MILVUS_EMBEDDING_PROVIDER=Gemini
- **AND** the `.env.example` file SHALL include MILVUS_GEMINI_API_KEY with documentation
- **AND** the `.env.example` file SHALL include MILVUS_EMBEDDING_MODEL=text-embedding-004
- **AND** documentation SHALL explain that MILVUS_GEMINI_API_KEY is separate from server's GOOGLE_API_KEY
- **AND** documentation SHALL explain Google Gemini API key acquisition

#### Scenario: Local Milvus address configuration

- **WHEN** setting up claude-context MCP
- **THEN** the `.env.example` file SHALL include MILVUS_ADDRESS=<coolify-server-address>:19530
- **AND** documentation SHALL explain that Milvus is hosted on a Coolify server
- **AND** documentation SHALL reference the docker/milvus/docker-compose.yml configuration
- **AND** documentation SHALL note that no MILVUS_TOKEN is required (authentication optional for self-hosted)
- **AND** documentation SHALL provide Coolify deployment instructions

### Requirement: Coolify Milvus Deployment Configuration

The system SHALL provide a standalone docker-compose configuration for deploying Milvus on a Coolify server, enabling shared vector database access across multiple projects.

#### Scenario: Standalone Milvus deployment

- **WHEN** deploying Milvus to Coolify server
- **THEN** a `docker/milvus/docker-compose.yml` file SHALL be provided
- **AND** the configuration SHALL run Milvus in standalone mode
- **AND** the configuration SHALL expose port 19530 for gRPC connections
- **AND** the configuration SHALL expose port 9091 for metrics (optional)
- **AND** the configuration SHALL use a persistent volume for data storage
- **AND** the configuration SHALL be compatible with Coolify's Docker deployment model

#### Scenario: Coolify deployment documentation

- **WHEN** setting up Milvus on Coolify
- **THEN** a `docker/milvus/README.md` SHALL provide deployment instructions
- **AND** documentation SHALL explain how to deploy to Coolify
- **AND** documentation SHALL document network requirements (ports, firewall rules)
- **AND** documentation SHALL explain how to configure MILVUS_ADDRESS for remote access
- **AND** documentation SHALL provide troubleshooting steps for connectivity issues

#### Scenario: Multi-project shared access

- **WHEN** multiple projects use the same Coolify-hosted Milvus
- **THEN** documentation SHALL explain collection-based isolation
- **AND** documentation SHALL explain that each project gets a unique collection based on file path
- **AND** documentation SHALL provide examples of managing multiple project indexes
- **AND** documentation SHALL explain how to clear specific project collections

### Requirement: Claude Context Architecture Documentation

The system SHALL document the claude-context architecture, data flow, and storage model to ensure developers understand how indexing and search works.

#### Scenario: Understanding data storage

- **WHEN** a developer reviews the claude-context documentation
- **THEN** documentation SHALL explain that embeddings are stored on Coolify-hosted Milvus server
- **AND** documentation SHALL clarify that the codebase itself never leaves the local machine
- **AND** documentation SHALL explain that only embedding API calls are made to Google Gemini
- **AND** documentation SHALL explain that vectors are sent to the self-hosted Milvus server
- **AND** documentation SHALL document network security considerations

#### Scenario: Understanding cost implications

- **WHEN** a developer evaluates claude-context integration
- **THEN** documentation SHALL provide cost estimates for Google Gemini embedding API usage (~$0.01/1M tokens)
- **AND** documentation SHALL note that Coolify-hosted Milvus is free (self-hosted, no external costs)
- **AND** documentation SHALL note that one Milvus instance can serve multiple projects
- **AND** documentation SHALL explain incremental indexing via Merkle trees reduces re-indexing costs
- **AND** documentation SHALL provide estimated costs for the spec-server-2 codebase (~$0.50-2)
- **AND** documentation SHALL clarify that claude-context costs are separate from server's Vertex AI costs

#### Scenario: Understanding privacy model

- **WHEN** a developer assesses data privacy
- **THEN** documentation SHALL explain that vectors are stored on self-hosted Coolify server (not third-party cloud)
- **AND** documentation SHALL explain that only embedding generation uses Google Gemini API
- **AND** documentation SHALL document collection isolation per codebase
- **AND** documentation SHALL provide instructions for clearing/deleting indexes
- **AND** documentation SHALL explain network security options (VPN, firewall rules)

### Requirement: Semantic Code Search Usage

The system SHALL document how to use claude-context MCP for semantic code search in AI coding workflows.

#### Scenario: Indexing the codebase

- **WHEN** a developer sets up claude-context for the first time
- **THEN** documentation SHALL provide step-by-step indexing instructions
- **AND** documentation SHALL explain how to check indexing status
- **AND** documentation SHALL list file inclusion/exclusion patterns

#### Scenario: Performing semantic search

- **WHEN** a developer needs to find code using natural language
- **THEN** documentation SHALL provide example queries
- **AND** documentation SHALL explain search result format
- **AND** documentation SHALL demonstrate integration with coding workflows

#### Scenario: Troubleshooting setup issues

- **WHEN** a developer encounters issues with claude-context MCP
- **THEN** documentation SHALL provide common troubleshooting steps
- **AND** documentation SHALL note Node.js version requirements (20.x or 22.x, not 24+)
- **AND** documentation SHALL explain how to verify MCP server connectivity
