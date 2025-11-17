# Change: Add Claude Context MCP for Semantic Code Search

## Why

The project currently relies on manual code exploration and search tools (grep, glob, task agents) to understand the codebase. Claude Context provides semantic code search using vector embeddings, allowing AI coding agents to quickly find relevant code across the entire codebase using natural language queries. This reduces token usage by ~40% while maintaining equivalent retrieval quality and enables faster, more accurate code discovery for complex multi-file changes.

Since the project already uses Google Gemini for embeddings and chat, we can leverage the existing `GOOGLE_API_KEY` for claude-context, keeping the tech stack consistent and reducing API provider complexity.

## What Changes

- Add `claude-context` MCP server to `.vscode/mcp.json` for OpenCode
- Create `.github/.copilot/mcp.json` configuration for GitHub Copilot
- Create `.gemini/settings.json` configuration template for Gemini CLI
- **Create standalone `docker/milvus/docker-compose.yml` for hosting on Coolify server**
- Add environment variable configuration in `.env.example` for:
  - `MILVUS_GEMINI_API_KEY` (Google API key for claude-context embeddings)
  - `MILVUS_EMBEDDING_PROVIDER=Gemini` (separate from server's Vertex AI setup)
  - `MILVUS_EMBEDDING_MODEL=text-embedding-004` (Google's latest embedding model)
  - `MILVUS_ADDRESS=<coolify-server-address>:19530` (remote Milvus server)
- Document setup instructions in the MCP integration guide
- Add indexing workflow and usage examples to developer documentation
- Add Coolify deployment guide for Milvus service

## Impact

- **Affected specs:** `mcp-integration` (new MCP server configuration)
- **Affected code:**
  - `.vscode/mcp.json` - Add claude-context server configuration
  - `.github/.copilot/mcp.json` - New file for GitHub Copilot MCP configuration
  - `.gemini/settings.json` - New template file for Gemini CLI
  - `docker/milvus/docker-compose.yml` - **NEW: Standalone docker-compose for Coolify deployment**
  - `docker/milvus/.env.example` - **NEW: Milvus-specific environment variables**
  - `.env.example` - Add MILVUS\_\* prefixed variables (MILVUS_EMBEDDING_PROVIDER, MILVUS_GEMINI_API_KEY, MILVUS_EMBEDDING_MODEL, MILVUS_ADDRESS)
  - `docs/setup/mcp-setup.md` or similar - Documentation updates
  - `docs/deployment/coolify-milvus-setup.md` - **NEW: Coolify deployment guide**
- **Dependencies:**
  - Requires Google Gemini API key (configured as `MILVUS_GEMINI_API_KEY`, separate from server's Vertex AI)
  - Requires Milvus server (hosted on Coolify server, shared across all projects)
- **Note on naming:** All claude-context/Milvus-related environment variables use `MILVUS_` prefix to avoid confusion with the server's existing embedding configuration (which uses Vertex AI)
- **Breaking changes:** None

## How It Works

### Architecture

1. **Code Indexing (One-time per file):**

   - Reads local codebase files
   - Chunks code using AST-based splitting
   - Sends code chunks to **Google Gemini** for embedding generation (~$0.00001/1K tokens - cheaper than OpenAI!)
   - Stores embeddings in **Local Milvus** (Docker container, fully local)

2. **Incremental Updates:**

   - Uses Merkle tree to detect file changes
   - Only re-indexes modified files
   - Dramatically reduces re-indexing costs

3. **Search Process:**
   - AI agent sends natural language query
   - Query → Google Gemini embedding → Local Milvus vector search
   - Returns relevant code chunks with file paths and line numbers
   - Hybrid search: BM25 (keyword) + semantic (vector similarity)

### Data Storage

- **Coolify-hosted Milvus:** Vector embeddings + metadata (file paths, line numbers, code chunks) - shared across all your projects
- **Local filesystem:** Configuration files (`.env`, MCP configs)
- **Google Gemini API:** Temporary embedding generation (no storage, API calls only)
- **Your codebase:** Never leaves your machine (only embeddings sent to Milvus)

### Privacy & Cost

- **Privacy:**
  - ✅ Vectors stored on **your Coolify server** (self-hosted, not third-party cloud)
  - ✅ Only embedding API calls to Google Gemini (no raw code stored)
  - ✅ Each codebase gets isolated Milvus collection
  - ✅ Network access controllable via Coolify firewall/VPN
- **Cost:**
  - Google Gemini API: ~$0.01 per 1M tokens (cheaper than OpenAI's $0.02)
  - Estimated for spec-server-2: **~$0.50-2** for initial indexing
  - Coolify-hosted Milvus: **Free** (self-hosted, no external fees, shared across all projects)
- **Control:** Clear/delete index anytime via MCP tools or Milvus web UI/CLI
