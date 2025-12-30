# EPF-Runtime: Shared Infrastructure Architecture

**Date**: 2025-12-30  
**Status**: Architecture Proposal  
**Context**: EPF-Runtime must share user/auth/tenant infrastructure with Emergent Core to enable suite vision

---

## Executive Summary

EPF-Runtime will integrate deeply with Emergent's existing multi-tenant infrastructure, sharing authentication (Zitadel), organization/project hierarchy, and Row-Level Security (RLS) enforcement. This enables the long-term vision: **Emergent as a suite of tools with common infrastructure and data foundation**.

**Key Principles**:
1. **Single User Identity**: One Zitadel account works across all Emergent tools (Core + Runtime)
2. **Shared Organization Hierarchy**: Organizations and Projects created in Core are accessible in Runtime
3. **Unified Authorization**: Same role-based access control (RBAC) and scope system
4. **Common RLS Enforcement**: PostgreSQL RLS policies ensure data isolation across all tools
5. **Integrated Knowledge Graph**: EPF artifacts stored in same graph as documents/chat/types

---

## Current Emergent Infrastructure (Foundation)

### Authentication System

**Provider**: Zitadel (self-hosted OAuth 2.0 / OIDC)

**Components**:
- `AuthService` (`apps/server/src/modules/auth/auth.service.ts`)
- `ZitadelService` (`apps/server/src/modules/auth/zitadel.service.ts`)
- `AuthGuard` (JWT verification + introspection)
- Dual service account pattern (client + API accounts)

**Token Flow**:
```
User → Zitadel Login UI → JWT token → API requests → AuthGuard → req.user
```

**Token Structure**:
```typescript
interface AuthUser {
  id: string;        // Internal user UUID (mapped from Zitadel sub)
  email: string;
  sub: string;       // Zitadel external ID
  scopes: string[];  // Expanded from memberships
}
```

### Multi-Tenant Hierarchy

**Entity Model**:
```
User (Zitadel ID → Internal UUID)
  ├─ OrganizationMembership (role: org_admin)
  │    └─ Organization (tenant boundary)
  │         └─ ProjectMembership (role: project_admin | project_user)
  │              └─ Project (workspace/context)
  │                   ├─ Documents
  │                   ├─ Chat Conversations
  │                   ├─ Type Registry
  │                   ├─ Template Packs
  │                   └─ (Future) EPF Artifacts
```

**Key Services**:
- `UserAccessService` - Returns org/project tree for user (`/user/orgs-and-projects`)
- `PermissionService` - Computes effective scopes from memberships
- `UserProfileService` - Maps Zitadel ID to internal user record

**Database Tables** (`kb` schema):
- `orgs` - Organizations (tenant boundaries)
- `projects` - Projects (workspaces within orgs)
- `organization_memberships` - User → Org + role
- `project_memberships` - User → Project + role

### Row-Level Security (RLS)

**Pattern**: PostgreSQL RLS policies on all `kb.*` tables

**Session Variables**:
```sql
app.current_organization_id  -- Derived from project_id
app.current_project_id        -- From X-Project-ID header or request param
```

**Enforcement**:
```typescript
// DatabaseService automatically applies context
await db.runWithTenantContext(projectId, async () => {
  // All queries filtered by RLS policies
  // WHERE project_id = current_setting('app.current_project_id')
});
```

**Request Flow**:
```
Client Request (X-Project-ID: "proj-456")
  ↓
Controller → DatabaseService.runWithTenantContext(projectId)
  ↓
DatabaseService derives orgId from projectId (cached lookup)
  ↓
SET app.current_organization_id = <derived>
SET app.current_project_id = <provided>
  ↓
Query executes → RLS filters rows → Only tenant's data returned
```

**RLS Tables** (all enforce project-level isolation):
- `kb.documents`
- `kb.document_chunks`
- `kb.chat_conversations`
- `kb.chat_messages`
- `kb.graph_objects`
- `kb.graph_relationships`
- `kb.type_registry`
- `kb.template_packs`
- `kb.object_extraction_jobs`

### Authorization (Roles & Scopes)

**Role Hierarchy**:
```
org_admin        → Full organization access
project_admin    → Full project access
project_user     → Read + limited write in project
```

**Scope Catalog** (subset enforced in Runtime):
```typescript
const ROLE_SCOPE_MAP = {
  org_admin: [
    'org:read', 'org:project:create', 'org:project:delete', 'org:invite:create',
    'project:read', 'project:invite:create',
    'documents:read', 'documents:write', 'documents:delete',
    'ingest:write', 'search:read', 'chunks:read',
    'chat:use', 'chat:admin',
    'extraction:read', 'extraction:write', 'extraction:delete',
    // (Future) 'epf:workflow:create', 'epf:workflow:read', 'epf:artifact:write'
  ],
  project_admin: [...],
  project_user: [...]
};
```

**Enforcement**:
- `ScopesGuard` decorator on controller methods
- `@Scopes('documents:write', 'project:read')` annotation
- Returns `403 Forbidden` with `missing_scopes` array if unauthorized

---

## EPF-Runtime Integration Architecture

### Phase 1: Shared Authentication & Tenant Context

**Goal**: EPF-Runtime API endpoints use same auth + tenant isolation as Core

**Implementation**:

1. **Reuse Existing Guards**:
   ```typescript
   // apps/server/src/modules/epf-runtime/epf-runtime.controller.ts
   
   @Controller('epf-runtime')
   @UseGuards(AuthGuard, ScopesGuard)
   export class EpfRuntimeController {
     
     @Post('workflows')
     @Scopes('epf:workflow:create')  // New scope
     async createWorkflow(
       @Req() req: Request,
       @Body() dto: CreateWorkflowDto
     ) {
       const projectId = req.headers['x-project-id'] as string;
       if (!projectId) {
         throw new BadRequestException('x-project-id header required');
       }
       
       // RLS context automatically applied via DatabaseService
       return await this.epfRuntimeService.createWorkflow(projectId, dto);
     }
   }
   ```

2. **Extend Scope Catalog**:
   ```typescript
   // apps/server/src/modules/auth/permission.service.ts
   
   const ROLE_SCOPE_MAP = {
     org_admin: [
       // ... existing scopes ...
       'epf:workflow:create',
       'epf:workflow:read',
       'epf:workflow:update',
       'epf:workflow:delete',
       'epf:artifact:read',
       'epf:artifact:write',
       'epf:artifact:delete',
       'epf:validation:run',
     ],
     project_admin: [
       'epf:workflow:create',
       'epf:workflow:read',
       'epf:workflow:update',
       'epf:artifact:read',
       'epf:artifact:write',
       'epf:validation:run',
     ],
     project_user: [
       'epf:workflow:read',
       'epf:artifact:read',
     ]
   };
   ```

3. **Service Layer Pattern**:
   ```typescript
   // apps/server/src/modules/epf-runtime/epf-runtime.service.ts
   
   @Injectable()
   export class EpfRuntimeService {
     constructor(
       private readonly db: DatabaseService,
       private readonly temporalClient: TemporalClient
     ) {}
     
     async createWorkflow(projectId: string, dto: CreateWorkflowDto) {
       // RLS context ensures workflow is scoped to project
       return await this.db.runWithTenantContext(projectId, async () => {
         // 1. Validate project exists and user has access (enforced by RLS)
         const project = await this.db.query(
           'SELECT id, organization_id FROM kb.projects WHERE id = $1',
           [projectId]
         );
         
         // 2. Create workflow record in database (RLS-protected)
         const workflow = await this.db.query(
           `INSERT INTO kb.epf_workflows 
            (project_id, phase, status, created_by, workflow_id) 
            VALUES ($1, $2, 'pending', $3, $4) 
            RETURNING *`,
           [projectId, dto.phase, dto.userId, dto.temporalWorkflowId]
         );
         
         // 3. Start Temporal workflow with project context
         await this.temporalClient.start({
           taskQueue: 'epf-runtime',
           workflowId: dto.temporalWorkflowId,
           args: [{
             projectId,
             phase: dto.phase,
             initialData: dto.initialData
           }]
         });
         
         return workflow.rows[0];
       });
     }
   }
   ```

### Phase 2: EPF Artifacts as Knowledge Graph Entities

**Goal**: Store EPF artifacts (North Star, Roadmap, Features, Value Models) in same graph as documents

**Database Schema** (extend existing `kb` schema):

```sql
-- EPF artifact types (reuse existing type registry)
INSERT INTO kb.type_registry (type, source, description, json_schema)
VALUES 
  ('epf:north-star', 'epf-runtime', 'EPF North Star Principle', {...}),
  ('epf:roadmap', 'epf-runtime', 'EPF Roadmap Recipe', {...}),
  ('epf:feature', 'epf-runtime', 'EPF Feature Definition', {...}),
  ('epf:value-model', 'epf-runtime', 'EPF Value Model', {...});

-- EPF workflows (orchestration metadata)
CREATE TABLE kb.epf_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES kb.orgs(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
  workflow_id TEXT NOT NULL UNIQUE,  -- Temporal workflow ID
  phase TEXT NOT NULL CHECK (phase IN ('READY', 'FIRE', 'AIM')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  created_by UUID NOT NULL REFERENCES core.users(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policy (same pattern as documents)
ALTER TABLE kb.epf_workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY epf_workflows_tenant_isolation ON kb.epf_workflows
  USING (project_id = current_setting('app.current_project_id', true)::uuid);

-- Index for workflow queries
CREATE INDEX idx_epf_workflows_project ON kb.epf_workflows(project_id, status, created_at DESC);
CREATE INDEX idx_epf_workflows_workflow_id ON kb.epf_workflows(workflow_id);

-- EPF artifacts (stored as graph objects with special type)
-- Reuse existing kb.graph_objects table:
-- - type_name = 'epf:north-star' | 'epf:roadmap' | etc.
-- - key = artifact identifier (e.g., 'north-star-emergent')
-- - name = artifact display name
-- - properties = full YAML content as JSONB
-- - project_id = FK to projects (RLS enforced)
```

**Storage Pattern**:
```typescript
// Store EPF artifact as graph object
async storeEpfArtifact(projectId: string, artifact: EpfArtifact) {
  return await this.db.runWithTenantContext(projectId, async () => {
    // 1. Validate artifact against JSON schema
    await this.validationService.validate(artifact, artifact.type);
    
    // 2. Create/update graph object
    const result = await this.db.query(
      `INSERT INTO kb.graph_objects 
       (project_id, type_name, key, name, properties, embedding_vec)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (project_id, type_name, key) 
       DO UPDATE SET properties = EXCLUDED.properties, updated_at = now()
       RETURNING *`,
      [
        projectId,
        artifact.type,                    // 'epf:north-star'
        artifact.key,                     // 'north-star-emergent'
        artifact.name,                    // 'Emergent North Star'
        JSON.stringify(artifact.content), // Full YAML as JSONB
        await this.embeddings.embed(artifact.name + artifact.description)
      ]
    );
    
    // 3. Create relationships to dependent artifacts
    for (const dep of artifact.dependencies || []) {
      await this.graphService.createRelationship({
        fromId: result.rows[0].id,
        toId: dep.targetId,
        relationshipType: 'depends_on',
        properties: { reason: dep.reason }
      });
    }
    
    return result.rows[0];
  });
}
```

**Benefits**:
- EPF artifacts searchable via same semantic search as documents
- Cross-product relationships visible in knowledge graph
- Vector embeddings enable "find similar strategies" queries
- Same RLS isolation protects sensitive product plans
- Existing graph visualization tools work for EPF artifacts

### Phase 3: Shared Organization/Project Switcher UI

**Goal**: Users see same org/project tree in Runtime UI as in Core UI

**API Integration**:
```typescript
// Frontend calls existing endpoint
GET /user/orgs-and-projects
Authorization: Bearer <jwt>

// Returns:
[
  {
    "id": "org-123",
    "name": "Acme Corp",
    "role": "org_admin",
    "projects": [
      {
        "id": "proj-456",
        "name": "Product Alpha",
        "orgId": "org-123",
        "role": "project_admin",
        "kb_purpose": "Documentation",
        "auto_extract_objects": true
      },
      {
        "id": "proj-789",
        "name": "EPF Strategy",
        "orgId": "org-123",
        "role": "project_admin",
        "kb_purpose": "Product Planning"  // EPF-focused project
      }
    ]
  }
]
```

**UI Pattern** (shared component):
```tsx
// apps/admin/src/components/ProjectSwitcher.tsx

export function ProjectSwitcher() {
  const { data: accessTree } = useUserAccess();  // Calls /user/orgs-and-projects
  const { activeOrgId, activeProjectId, setContext } = useAppContext();
  
  return (
    <Dropdown>
      {accessTree?.map(org => (
        <OrgSection key={org.id} org={org}>
          {org.projects.map(project => (
            <ProjectOption
              key={project.id}
              project={project}
              active={project.id === activeProjectId}
              onClick={() => setContext(org.id, project.id)}
            />
          ))}
        </OrgSection>
      ))}
    </Dropdown>
  );
}
```

**Context Propagation**:
```typescript
// apps/admin/src/hooks/use-api.ts

export function useApi() {
  const { activeOrgId, activeProjectId } = useAppContext();
  
  const fetchJson = async (url: string, options?: RequestInit) => {
    const headers = {
      ...options?.headers,
      'X-Project-ID': activeProjectId,  // Automatically added
      // X-Org-ID removed (derived server-side from project)
    };
    
    return fetch(url, { ...options, headers });
  };
  
  return { fetchJson };
}
```

### Phase 4: Unified Sidebar Navigation

**Goal**: Single sidebar shows both Core tools and Runtime tools with context awareness

**Navigation Structure**:
```typescript
// Sidebar sections
const navigation = [
  {
    section: "Knowledge Base",
    icon: "database",
    items: [
      { name: "Documents", href: "/documents", scope: "documents:read" },
      { name: "Chat", href: "/chat", scope: "chat:use" },
      { name: "Search", href: "/search", scope: "search:read" }
    ]
  },
  {
    section: "Product Strategy",  // EPF Runtime
    icon: "target",
    items: [
      { name: "North Star", href: "/epf/north-star", scope: "epf:artifact:read" },
      { name: "Roadmap", href: "/epf/roadmap", scope: "epf:artifact:read" },
      { name: "Features", href: "/epf/features", scope: "epf:artifact:read" },
      { name: "Workflows", href: "/epf/workflows", scope: "epf:workflow:read" }
    ]
  },
  {
    section: "Configuration",
    icon: "settings",
    items: [
      { name: "Type Registry", href: "/type-registry", scope: "project:read" },
      { name: "Integrations", href: "/integrations", scope: "project:read" }
    ]
  }
];
```

**Scope-Based Visibility**:
```tsx
{navigation.map(section => (
  <SidebarSection key={section.section} title={section.section}>
    {section.items
      .filter(item => userHasScope(item.scope))  // Hide if no permission
      .map(item => (
        <SidebarItem key={item.name} {...item} />
      ))}
  </SidebarSection>
))}
```

---

## Migration Plan

### Stage 1: Foundation (Weeks 1-2)

**Deliverables**:
- [ ] Extend `ROLE_SCOPE_MAP` with EPF scopes
- [ ] Create `kb.epf_workflows` table with RLS policies
- [ ] Add EPF artifact types to `kb.type_registry`
- [ ] Create `EpfRuntimeController` with AuthGuard + ScopesGuard
- [ ] Implement `EpfRuntimeService` using `DatabaseService.runWithTenantContext()`

**Tests**:
- [ ] E2E: Create workflow in Project A, verify not visible in Project B (RLS isolation)
- [ ] E2E: Attempt workflow creation without `epf:workflow:create` scope → 403
- [ ] E2E: Verify `x-project-id` header required → 400 if missing

### Stage 2: Artifact Storage (Weeks 3-4)

**Deliverables**:
- [ ] Implement `storeEpfArtifact()` method (stores artifacts as graph objects)
- [ ] Add EPF artifact validation against JSON schemas
- [ ] Create relationships between artifacts (North Star → Roadmap → Features)
- [ ] Add vector embeddings for semantic search

**Tests**:
- [ ] E2E: Store North Star, query via semantic search
- [ ] E2E: Create Feature with dependency on Roadmap, verify relationship
- [ ] E2E: Validate invalid artifact → 400 with schema errors

### Stage 3: UI Integration (Weeks 5-6)

**Deliverables**:
- [ ] Reuse `ProjectSwitcher` component in Runtime UI
- [ ] Add "Product Strategy" section to sidebar
- [ ] Implement EPF artifact CRUD pages (North Star, Roadmap, Features)
- [ ] Add workflow status dashboard

**Tests**:
- [ ] E2E: Switch project in Core UI, verify context in Runtime UI
- [ ] E2E: User without `epf:artifact:read` sees no Strategy section
- [ ] E2E: Create artifact in UI, verify stored in graph

### Stage 4: Temporal Integration (Weeks 7-8)

**Deliverables**:
- [ ] Implement Temporal workflows for READY/FIRE/AIM phases
- [ ] Add workflow status tracking (pending → running → completed)
- [ ] Implement webhook triggers for external tools
- [ ] Add workflow history and audit logs

**Tests**:
- [ ] E2E: Start READY workflow, verify database + Temporal state
- [ ] E2E: Workflow failure → error captured in `kb.epf_workflows`
- [ ] E2E: Complete workflow → artifacts stored in graph

---

## Security Considerations

### 1. RLS Enforcement

**Critical**: All EPF tables must have RLS policies

```sql
-- Template for EPF tables
ALTER TABLE kb.epf_<table> ENABLE ROW LEVEL SECURITY;

CREATE POLICY epf_<table>_tenant_isolation ON kb.epf_<table>
  USING (project_id = current_setting('app.current_project_id', true)::uuid);
```

**Test Coverage**:
- Every EPF E2E test must verify cross-project isolation
- Test: Create artifact in Project A → Query from Project B → Not visible

### 2. Scope Validation

**Critical**: All EPF endpoints must use `@Scopes()` decorator

```typescript
@Post('workflows')
@Scopes('epf:workflow:create')  // Required
async createWorkflow(...) { ... }
```

**Test Coverage**:
- Every EPF endpoint must have E2E test verifying 403 without scope
- Test: Remove `epf:workflow:create` from user → POST /workflows → 403

### 3. Project Context Required

**Critical**: All EPF endpoints must validate `x-project-id` header

```typescript
const projectId = req.headers['x-project-id'] as string;
if (!projectId) {
  throw new BadRequestException('x-project-id header required');
}
```

**Test Coverage**:
- Every EPF endpoint must have E2E test verifying 400 without header
- Test: POST /workflows without `x-project-id` → 400

### 4. Temporal Workflow Authorization

**Critical**: Temporal workflows must validate project membership before execution

```typescript
// Inside Temporal workflow
async function epfReadyPhaseWorkflow(args: { projectId: string, userId: string }) {
  // Verify user still has access to project
  const hasAccess = await checkProjectMembership(args.userId, args.projectId);
  if (!hasAccess) {
    throw new Error('User no longer has access to project');
  }
  
  // Execute workflow with project context
  await runWithTenantContext(args.projectId, async () => {
    // ... workflow logic ...
  });
}
```

---

## API Examples

### Create Workflow

```http
POST /epf-runtime/workflows
Authorization: Bearer <jwt>
X-Project-ID: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{
  "phase": "READY",
  "workflowType": "lean-start",
  "initialData": {
    "productName": "New SaaS Tool",
    "targetMarket": "B2B Enterprise"
  }
}

# Response
{
  "id": "wf-123",
  "workflowId": "epf-ready-550e8400-20251230",
  "phase": "READY",
  "status": "running",
  "projectId": "550e8400-e29b-41d4-a716-446655440000",
  "createdAt": "2025-12-30T10:00:00Z"
}
```

### Store EPF Artifact

```http
POST /epf-runtime/artifacts
Authorization: Bearer <jwt>
X-Project-ID: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{
  "type": "epf:north-star",
  "key": "north-star-new-saas",
  "name": "New SaaS Tool North Star",
  "content": {
    "strategic_imperative": "Enable teams to collaborate efficiently",
    "aspirational_vision": "World's easiest collaboration platform",
    "guiding_principles": [...]
  }
}

# Response
{
  "id": "obj-456",
  "type": "epf:north-star",
  "key": "north-star-new-saas",
  "projectId": "550e8400-e29b-41d4-a716-446655440000",
  "createdAt": "2025-12-30T10:05:00Z"
}
```

### Query EPF Artifacts (Semantic Search)

```http
GET /search/semantic?query=product+strategy+for+B2B&types=epf:roadmap,epf:value-model
Authorization: Bearer <jwt>
X-Project-ID: 550e8400-e29b-41d4-a716-446655440000

# Response
{
  "results": [
    {
      "id": "obj-789",
      "type": "epf:roadmap",
      "name": "Q1 2025 Product Roadmap",
      "score": 0.89,
      "snippet": "Focus on B2B enterprise features..."
    },
    {
      "id": "obj-456",
      "type": "epf:north-star",
      "name": "New SaaS Tool North Star",
      "score": 0.82,
      "snippet": "Enable teams to collaborate efficiently..."
    }
  ]
}
```

---

## Technical Debt & Future Enhancements

### Short-Term (3-6 months)

1. **Audit Logs**: Add `kb.audit_logs` table for EPF artifact changes
2. **Versioning**: Add version history for EPF artifacts (compare v1 vs v2 roadmap)
3. **Permissions Granularity**: Split `epf:artifact:write` into per-type scopes
4. **Workflow Templates**: Pre-built workflow configurations for common scenarios
5. **Webhook Retry**: Add exponential backoff for failed webhook deliveries

### Medium-Term (6-12 months)

1. **Cross-Project Linking**: Allow artifacts to reference artifacts from other projects (with permission checks)
2. **Artifact Approval Workflow**: Require review/approval before artifact becomes "active"
3. **AI-Generated Artifacts**: LLM integration to suggest roadmap items based on North Star
4. **Temporal UI Integration**: Embed Temporal Web UI in Runtime dashboard
5. **Export to EPF YAML**: Download artifacts in canonical EPF YAML format

### Long-Term (12+ months)

1. **Multi-Product Portfolio**: Manage multiple product lines under one organization
2. **Cross-Organization Sharing**: Share public artifacts across org boundaries (with consent)
3. **Artifact Marketplace**: Public library of EPF templates and examples
4. **Advanced Analytics**: Measure roadmap completion velocity, feature adoption rates
5. **Integration Hub**: Connect EPF cycles to Jira, Linear, GitHub Projects automatically

---

## Success Metrics

### Technical Metrics

- **RLS Enforcement**: 100% of EPF tables have RLS policies enabled
- **Scope Coverage**: 100% of EPF endpoints use `@Scopes()` decorator
- **Test Coverage**: ≥90% line coverage for EPF modules
- **Isolation Tests**: Every E2E test verifies cross-project data isolation
- **Performance**: Workflow creation ≤500ms p99 latency

### User Experience Metrics

- **Single Sign-On**: Users authenticate once, access all tools
- **Context Persistence**: Project switcher state syncs across Core + Runtime
- **Permission Clarity**: Users see only features they have access to
- **Data Sovereignty**: Enterprise customers verify data isolation via RLS audit
- **Suite Adoption**: Users with Core accounts adopt Runtime without re-onboarding

### Business Metrics

- **Shared Infrastructure Cost**: Runtime shares 80%+ of Core infrastructure
- **Development Velocity**: New tools added to suite 50% faster (reuse auth/tenant)
- **Customer Satisfaction**: NPS score for "suite integration" ≥8/10
- **Enterprise Sales**: Multi-tool contracts increase 30% YoY
- **Operational Efficiency**: Support tickets reduced 40% (unified auth/access control)

---

## Architecture Decisions (2025-12-30)

### Confirmed Product Decisions

1. **Artifact Visibility**: ✅ **Within current project only** - EPF artifacts share same project isolation as documents. No cross-project search (users must switch projects to see different strategies).

2. **Workflow Notifications**: ✅ **In-app notifications for MVP** - Email notifications deferred to future enhancement. Use existing notification system (`kb.notifications` table + websocket).

3. **Cross-Tool Navigation**: ✅ **Separate apps with switcher for MVP** - Runtime gets its own top-level app entry in switcher (like "Knowledge Base" vs "EPF Runtime"). Future: consider unified sidebar when integration matures.

4. **MVP Scope**: ✅ **Full Stage 1-4** - Commit to complete foundation + storage + UI + Temporal integration. Deliverable: functional workflow orchestration with UI by end of implementation.

### Confirmed Technical Decisions

1. **Temporal Deployment**: ✅ **Same cluster as other workloads** - Reuse existing Temporal infrastructure. Separate task queue (`epf-runtime`) for workflow isolation without infrastructure overhead.

2. **Namespace Strategy**: ✅ **One namespace per project** - Aligns with project-level isolation pattern. Temporal namespace = `epf-{projectId}` for clean separation.

3. **Database Scaling**: ✅ **Acceptable growth** - Estimate +20% rows from EPF artifacts. Existing RLS patterns already handle multi-tenant scale. Monitor and optimize as needed.

4. **Vector Embeddings**: ✅ **Async queue** - Use existing extraction job queue pattern. Regenerate embeddings on artifact update via background job (non-blocking).

5. **Webhook Reliability**: ✅ **Temporal child workflow** - Leverage Temporal's built-in retry/durability. Webhook delivery = child workflow with exponential backoff policy.

### Strategic Vision: EPF-Runtime as Future OS Layer

**Long-Term Architecture (12-24 months)**:

```
EPF-Runtime (OS Layer)
├─ Authentication & Authorization (centralized)
├─ Multi-Tenancy & RLS (core infrastructure)
├─ Workflow Orchestration (Temporal)
├─ Event Bus (pub/sub for app communication)
└─ Shared Services
    ├─ Knowledge Graph
    ├─ Vector Search
    ├─ Type Registry
    └─ Notification System

Applications (running on EPF OS)
├─ Emergent Core (knowledge base, documents, chat, search)
├─ EPF Strategy (product planning, roadmaps, features)
├─ (Future) Emergent Analytics
├─ (Future) Emergent Integrations Hub
└─ (Future) Third-Party Apps
```

**Design Principle for MVP**: Keep Runtime "somewhat separate" but architect with OS future in mind:
- ✅ Shared infrastructure (auth, tenant, database) - foundation for OS layer
- ✅ Separate app entry (switcher) - allows independent evolution
- ✅ Modular services - Runtime services can become platform APIs later
- ✅ Event-driven patterns - prepare for future app-to-app communication
- ⚠️ Avoid tight coupling - Core shouldn't directly import Runtime code (interface via API/events)

**Migration Path to OS Architecture**:
1. **Phase 1 (MVP)**: Runtime = app alongside Core (current proposal)
2. **Phase 2 (6mo)**: Extract shared services into platform layer (auth, graph, search become "EPF Platform APIs")
3. **Phase 3 (12mo)**: Core refactored to use platform APIs (becomes "app running on EPF OS")
4. **Phase 4 (18mo)**: Third-party apps can build on EPF OS (marketplace/ecosystem)

### Deferred Decisions (Future Iterations)

1. **Role Defaults**: When user creates org, automatically grant `epf:*` scopes? → Defer to post-MVP user feedback
2. **Artifact Versioning**: Track full history or overwrite? → Start with overwrite, add versioning when requested
3. **Scope Proliferation**: JWT token size impact from +8 scopes? → Monitor, optimize if needed
4. **Artifact Encryption**: Encrypt sensitive strategies at rest? → Defer to enterprise security audit
5. **Cross-Org Sharing**: Public artifact library/marketplace? → Defer to Phase 4 (OS ecosystem)

---

## Appendix: Related Documentation

### Emergent Core Documentation

- `docs/spec/03-architecture.md` - Multi-tenancy & RLS architecture
- `docs/spec/18-authorization-model.md` - Roles, scopes, membership model
- `docs/patterns/DATABASE_SERVICE_PATTERN.md` - RLS implementation guide
- `docs/migrations/MIGRATION_TRACKING.md` - Current schema state
- `openspec/changes/remove-org-id-from-api-headers/` - Tenant context derivation

### EPF Framework Documentation

- `docs/EPF/README.md` - EPF framework overview
- `docs/EPF/schemas/` - JSON Schema definitions for artifacts
- `docs/EPF/templates/READY/` - Strategy & planning templates
- `docs/EPF/_instances/emergent/FIRE/value_models/product.epf-runtime.value_model.yaml` - Runtime value model

### Code References

- `apps/server/src/modules/auth/` - Authentication & authorization services
- `apps/server/src/modules/user/` - User access tree service
- `apps/server/src/common/database/database.service.ts` - RLS enforcement
- `apps/server/tests/e2e/org.project-rls.e2e.spec.ts` - RLS test examples

---

## Next Steps

1. **Review with Team**: Present architecture to product/eng stakeholders
2. **Answer Questions**: Resolve open questions listed above
3. **Refine Scope**: Decide MVP scope (Stage 1-2 vs full 1-4)
4. **Create Tickets**: Break down Stage 1 into actionable development tasks
5. **Prototype**: Build minimal endpoint to validate RLS + scope integration
6. **Document**: Update EPF value model with finalized architecture decisions

---

**Document Owner**: AI Assistant  
**Last Updated**: 2025-12-30  
**Status**: Draft - Awaiting Stakeholder Review
