# Feature Definition Grouping Strategy - Step 1 Proposal

**Goal**: Map 38 implemented modules into ~8-12 high-level feature definitions that represent user-facing capabilities and align with roadmap solution scaffold.

**Date**: 2025-12-16
**Status**: PROPOSAL - Awaiting approval
**Next Step**: Once approved, create individual feature_definition YAML files

---

## Proposed Feature Definitions

### 1. **Knowledge Graph Engine** (fd-001)
**Maps to**: Roadmap comp-p-001 (Knowledge Graph Engine)  
**User Value**: "Store and query organizational knowledge as an interconnected graph"

**Included Modules** (9):
- GraphModule (core graph CRUD)
- TypeRegistryModule (schema management)
- GraphSearchModule (hybrid lexical+vector search)
- UnifiedSearchModule (cross-content search)
- GraphVectorSearchService (semantic similarity)
- EmbeddingsModule (vector generation)
- SearchModule (legacy full-text search)
- DatabaseModule (PostgreSQL + pgvector)
- UtilsModule (shared utilities)

**Key Capabilities**:
- Dynamic object types and relationships
- Hybrid search (lexical + vector + graph traversal)
- PostgreSQL pgvector for semantic search (768d, Vertex AI)
- Schema registry for type definitions
- Merge/branch operations

---

### 2. **Document Ingestion Pipeline** (fd-002)
**Maps to**: Roadmap comp-p-002 (Document Ingestion Pipeline)  
**User Value**: "Automatically extract knowledge from documents and populate the graph"

**Included Modules** (5):
- DocumentsModule (document storage/retrieval)
- ChunksModule (document chunking)
- IngestionModule (pipeline orchestration)
- ExtractionJobModule (entity extraction jobs)
- DiscoveryJobModule (automated discovery)

**Key Capabilities**:
- PDF/Markdown/code ingestion (kr-p-002: 95% accuracy target)
- Automated entity extraction from documents
- Document chunking and vectorization
- Background job processing
- Discovery automation

---

### 3. **AI-Native Chat Interface** (fd-003)
**Maps to**: Roadmap comp-p-004 (Admin UI - Chat component)  
**User Value**: "Natural language interface to query knowledge graph with AI assistance"

**Included Modules** (5):
- ChatModule (conversation management)
- ChatUiModule (frontend chat components)
- ChatSdkModule (client SDK)
- AgentsModule (autonomous AI agents)
- LangfuseModule (observability)

**Key Capabilities**:
- Conversational knowledge retrieval
- AI-powered query understanding
- Multi-turn conversations with context
- Autonomous agent orchestration
- LLM observability and tracing

---

### 4. **Model Context Protocol (MCP) Server** (fd-004)
**Maps to**: Roadmap comp-p-003 (MCP Server)  
**User Value**: "Connect AI coding tools (Cursor, Claude) to organizational knowledge"

**Included Modules** (1):
- McpModule (MCP server implementation)

**Key Capabilities**:
- MCP protocol server for AI tool integration
- Context provision to external AI agents
- Tool definitions for knowledge queries
- Cursor/Claude/Copilot integration (kr-p-003: 5+ pilots)

---

### 5. **Template Packs System** (fd-005)
**Maps to**: Custom feature (not in original roadmap scaffold)  
**User Value**: "Reusable templates for common extraction/graph patterns"

**Included Modules** (1):
- TemplatePackModule

**Key Capabilities**:
- Pre-built entity/relationship schemas
- Domain-specific extraction templates
- Schema marketplace/sharing
- Quick-start configurations

---

### 6. **Integration Framework** (fd-006)
**Maps to**: Custom feature (extensibility)  
**User Value**: "Connect external tools and data sources to Emergent"

**Included Modules** (2):
- IntegrationsModule (framework)
- ClickUpModule (example: ClickUp integration)

**Key Capabilities**:
- Pluggable integration architecture
- OAuth/API key management
- Bi-directional sync
- Example: ClickUp task/project import

---

### 7. **Authentication & Multi-Tenancy** (fd-007)
**Maps to**: Core platform capability  
**User Value**: "Secure access control and organization/project isolation"

**Included Modules** (6):
- AuthModule (Zitadel integration)
- OrgsModule (organization management)
- ProjectsModule (project/workspace management)
- UserModule (user profiles)
- UserProfileModule (extended profiles)
- InvitesModule (team onboarding)

**Key Capabilities**:
- SSO via Zitadel
- Multi-tenant architecture (org → projects)
- Role-based access control
- Team invitations and onboarding

---

### 8. **Observability & Monitoring** (fd-008)
**Maps to**: Operations/DevOps capability  
**User Value**: "Track system health, usage, and performance"

**Included Modules** (6):
- MonitoringModule (system metrics)
- UserActivityModule (user analytics)
- EventsModule (event tracking)
- ClientLogsModule (frontend error tracking)
- NotificationsModule (alerts)
- TasksModule (background job management)

**Key Capabilities**:
- Application performance monitoring
- User behavior analytics
- Event-driven notifications
- Background job queue monitoring
- Frontend error tracking

---

### 9. **Admin UI & API** (fd-009)
**Maps to**: Roadmap comp-p-004 (Admin UI)  
**User Value**: "Web interface for managing knowledge graph and system"

**Included Modules** (4):
- Admin frontend (apps/admin - separate app)
- OpenApiModule (API documentation)
- SettingsModule (configuration)
- HealthModule (health checks)

**Key Capabilities**:
- React admin dashboard
- OpenAPI/Swagger documentation
- System configuration UI
- Health check endpoints
- Real-time status monitoring

---

## Rationale

### Why This Grouping?

1. **User-Centric**: Each feature represents a distinct user-facing capability or value proposition
2. **Roadmap-Aligned**: Maps directly to solution scaffold components (comp-p-001 through comp-p-004)
3. **Appropriate Granularity**: 9 features (vs 38 modules) - manageable for EPF tracking
4. **Implementation-Informed**: Respects actual module boundaries and dependencies
5. **Product Portfolio Coverage**:
   - **Emergent Core**: fd-001, fd-002, fd-003, fd-007, fd-008, fd-009
   - **Emergent Tools**: fd-004 (MCP Server)
   - **Emergent Frameworks**: fd-005 (Template Packs)
   - **Platform Extensions**: fd-006 (Integrations)

### Excluded/Combined Modules

- **AppConfigModule**: Infrastructure, not a feature
- **UtilsModule**: Shared utilities, bundled into fd-001
- **DatabaseModule**: Infrastructure, bundled into fd-001

---

## Next Steps - Staged Approval

### Step 2: Review & Approve Grouping
**Question for approval**: 
- Do these 9 feature definitions represent the right level of granularity?
- Should any be split or combined?
- Are the roadmap mappings correct?

### Step 3: Create Feature Definition Files
Once grouping approved, create YAML files:
- `fd-001_knowledge_graph_engine.yaml`
- `fd-002_document_ingestion_pipeline.yaml`
- `fd-003_ai_native_chat.yaml`
- `fd-004_mcp_server.yaml`
- `fd-005_template_packs.yaml`
- `fd-006_integration_framework.yaml`
- `fd-007_auth_multitenancy.yaml`
- `fd-008_observability_monitoring.yaml`
- `fd-009_admin_ui_api.yaml`

### Step 4: Fix Technology Stack Documentation
**CRITICAL CORRECTIONS** (after feature definitions approved):
- openspec/specs/products/core/value-proposition.md
- apps/admin/src/pages/emergent-core/components/Features.tsx
- docs/spec/19-dynamic-object-graph.md
- docs/spec/20-embeddings.md

**Changes**: LanceDB → PostgreSQL pgvector, OpenAI 1536d → Google Vertex AI 768d

---

## Questions for Review

1. **Granularity Check**: Are 9 feature definitions at the right level? (vs 38 modules or fewer mega-features)
2. **Grouping Logic**: Do the module groupings make sense? Any that should move?
3. **Priority**: Which feature definitions should we create first?
4. **Naming**: Are the feature names clear and user-centric?

**Awaiting approval to proceed to Step 3**
