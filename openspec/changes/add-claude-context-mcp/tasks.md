# Implementation Tasks

## 1. Coolify Milvus Service Configuration

- [ ] 1.1 Create docker/milvus/ directory structure
- [ ] 1.2 Create docker/milvus/docker-compose.yml for standalone Milvus deployment
- [ ] 1.3 Configure Milvus ports (19530 for gRPC, 9091 for metrics)
- [ ] 1.4 Add Milvus volume for persistent storage
- [ ] 1.5 Configure Milvus environment variables (ETCD_USE_EMBED, COMMON_STORAGETYPE)
- [ ] 1.6 Create docker/milvus/.env.example with deployment configuration
- [ ] 1.7 Add docker/milvus/README.md with Coolify deployment instructions
- [ ] 1.8 Document network requirements (port exposure, firewall rules)

## 2. Environment Configuration

- [ ] 2.1 Add MILVUS_EMBEDDING_PROVIDER=Gemini to .env.example
- [ ] 2.2 Add MILVUS_GEMINI_API_KEY to .env.example (separate from server's GOOGLE_API_KEY)
- [ ] 2.3 Add MILVUS_EMBEDDING_MODEL=text-embedding-004 to .env.example
- [ ] 2.4 Add MILVUS_ADDRESS=<coolify-server-address>:19530 to .env.example
- [ ] 2.5 Document that MILVUS\_\* variables are for claude-context MCP only
- [ ] 2.6 Document that server continues to use Vertex AI (VERTEX*EMBEDDING*\* variables)
- [ ] 2.7 Document Google Gemini API key acquisition
- [ ] 2.8 Document Coolify-hosted Milvus service connection requirements

## 3. OpenCode MCP Configuration

- [ ] 3.1 Add claude-context server to .vscode/mcp.json
- [ ] 3.2 Configure EMBEDDING_PROVIDER=Gemini in MCP server env
- [ ] 3.3 Configure GEMINI_API_KEY from MILVUS_GEMINI_API_KEY in MCP server env
- [ ] 3.4 Configure EMBEDDING_MODEL from MILVUS_EMBEDDING_MODEL in MCP server env
- [ ] 3.5 Configure MILVUS_ADDRESS from environment variable (remote Coolify server)
- [ ] 3.6 Test configuration with `opencode` CLI

## 4. GitHub Copilot Configuration

- [ ] 4.1 Create .github/.copilot/ directory
- [ ] 4.2 Create .github/.copilot/mcp.json with claude-context configuration
- [ ] 4.3 Configure EMBEDDING_PROVIDER=Gemini in Copilot MCP env
- [ ] 4.4 Configure GEMINI_API_KEY from MILVUS_GEMINI_API_KEY in Copilot MCP env
- [ ] 4.5 Configure EMBEDDING_MODEL and MILVUS_ADDRESS in Copilot MCP env
- [ ] 4.6 Add .github/.copilot/.gitignore to exclude sensitive data
- [ ] 4.7 Document GitHub Copilot MCP setup in README or docs

## 5. Gemini CLI Configuration

- [ ] 5.1 Create .gemini/ directory
- [ ] 5.2 Create .gemini/settings.json template with claude-context configuration
- [ ] 5.3 Configure EMBEDDING_PROVIDER=Gemini in Gemini CLI MCP env
- [ ] 5.4 Configure GEMINI_API_KEY from MILVUS_GEMINI_API_KEY in Gemini CLI MCP env
- [ ] 5.5 Configure EMBEDDING_MODEL and MILVUS_ADDRESS in Gemini CLI MCP env
- [ ] 5.6 Add .gemini/ to .gitignore (user-specific configuration)
- [ ] 5.7 Document Gemini CLI setup instructions

## 6. Documentation

- [ ] 6.1 Create or update MCP integration guide with claude-context section
- [ ] 6.2 Document indexing workflow (how to index codebase)
- [ ] 6.3 Add usage examples for semantic code search
- [ ] 6.4 Document troubleshooting tips (Node.js version requirements, API key issues)
- [ ] 6.5 Add to .opencode/instructions.md or create dedicated claude-context guide
- [ ] 6.6 Create docs/deployment/coolify-milvus-setup.md with Coolify deployment instructions
- [ ] 6.7 Document multi-project usage (how multiple repos share one Milvus instance)
- [ ] 6.8 Document collection management and cleanup procedures

## 7. Testing

- [ ] 7.1 Deploy Milvus to Coolify server and verify connectivity
- [ ] 7.2 Verify MILVUS\_\* environment variables are properly set
- [ ] 7.3 Test network connectivity from local machine to Coolify Milvus
- [ ] 7.4 Test OpenCode configuration with sample queries
- [ ] 7.5 Verify MILVUS_GEMINI_API_KEY works with Google Gemini API
- [ ] 7.6 Confirm server's Vertex AI embeddings still work (no conflicts with MILVUS\_\* variables)
- [ ] 7.7 Test indexing workflow on project codebase (start with small directory)
- [ ] 7.8 Validate search quality with representative queries
- [ ] 7.9 Test incremental indexing (modify file, re-index, verify Merkle tree optimization)
- [ ] 7.10 Verify Milvus data persistence (restart service, check index survives)
- [ ] 7.11 Test multi-project usage (index multiple repos, verify collection isolation)
