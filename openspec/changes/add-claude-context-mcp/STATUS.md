# Change Status: Add Claude Context MCP

**Status:** 📝 Proposal Complete - Ready for Implementation
**Last Updated:** 2025-11-18

## Summary

Proposal for integrating claude-context MCP server for semantic code search, with Milvus vector database hosted on Coolify server (shared across all projects).

## Key Decisions Made

1. **Embedding Provider:** Google Gemini API (`text-embedding-004`)
   - Rationale: Already using Gemini, cheaper than OpenAI, same model as Vertex AI
   
2. **Vector Database:** Milvus hosted on Coolify server
   - Rationale: Self-hosted, shared across all projects, always available, better resource management
   
3. **Variable Naming:** `MILVUS_*` prefix for all claude-context variables
   - Rationale: Avoids conflicts with server's existing Vertex AI embedding configuration

## Architecture

```
Multiple Local Projects
  ↓ (embeddings via Google Gemini API)
  ↓
Coolify-Hosted Milvus Server
  ├── Collection: spec-server-2
  ├── Collection: another-project
  └── Collection: third-project
```

## Files Modified

- ✅ `openspec/changes/add-claude-context-mcp/proposal.md` - Updated for Coolify deployment
- ✅ `openspec/changes/add-claude-context-mcp/tasks.md` - 50 implementation tasks
- ✅ `openspec/changes/add-claude-context-mcp/specs/mcp-integration/spec.md` - 5 requirements, 16 scenarios

## Files to Create (During Implementation)

- `docker/milvus/docker-compose.yml` - Standalone Milvus for Coolify
- `docker/milvus/.env.example` - Milvus environment configuration
- `docker/milvus/README.md` - Coolify deployment instructions
- `.vscode/mcp.json` updates - Claude-context server config
- `.github/.copilot/mcp.json` - GitHub Copilot MCP config
- `.gemini/settings.json` - Gemini CLI template
- `docs/deployment/coolify-milvus-setup.md` - Deployment guide

## Estimated Effort

- Setup Coolify Milvus: 1-2 hours
- Configure MCP clients: 1 hour
- Initial indexing: 30 minutes
- Testing & documentation: 1-2 hours
- **Total:** 4-6 hours

## Estimated Costs

- Initial indexing: ~$0.50-2 (one-time)
- Incremental updates: ~$0.01-0.10/month
- Milvus hosting: Free (self-hosted on Coolify)
- **ROI:** Break-even in 1-2 months if saves 40% tokens

## Next Steps When Ready

1. Create `docker/milvus/` deployment configuration
2. Deploy Milvus to Coolify server
3. Configure MCP clients (OpenCode, Copilot, Gemini CLI)
4. Test with small directory first
5. Index full codebase
6. Validate search quality and token savings

## Notes

- Proposal validated with `openspec validate --strict` ✓
- All changes backward compatible (no breaking changes)
- Can be removed easily if not providing value
- Collection-based isolation allows multiple projects to share one Milvus instance
