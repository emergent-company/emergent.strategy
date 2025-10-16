# Project Settings UI

Status: Draft  
Created: 2025-10-04  
Related: `24-dynamic-type-discovery-and-ingestion.md`, `13-routing-and-urls.md`, `18-authorization-model.md`

---

## 1. Overview

This specification defines the Project Settings interface where project administrators can configure project-level settings including object templates (template packs), project metadata, and other configuration options.

**Key Features:**
1. **Template Pack Selection** - Choose and manage object type templates for the project
2. **Project Metadata** - Edit project name, description, and other basic settings
3. **Access Control** - Manage project members and permissions (future)
4. **Integration Settings** - Configure third-party integrations (future)

## 2. Routing & Navigation

### 2.1 URL Structure

```
/admin/settings/project           → Project Settings (redirect to general tab)
/admin/settings/project/general   → General settings (name, description)
/admin/settings/project/templates → Object template pack management
/admin/settings/project/members   → Team members & access control (future)
/admin/settings/project/integrations → Third-party integrations (future)
```

### 2.2 Sidebar Navigation

The settings section should be added to the Admin sidebar:

```tsx
<Sidebar.Section id="admin-settings" title="Settings" className="mt-4">
    <Sidebar.MenuItem
        id="admin-settings-project"
        url="/admin/settings/project"
        icon="lucide--settings"
    >
        Project Settings
    </Sidebar.MenuItem>
    <Sidebar.MenuItem
        id="admin-settings-ai-prompts"
        url="/admin/settings/ai/prompts"
        icon="lucide--book-text"
    >
        AI Prompts
    </Sidebar.MenuItem>
</Sidebar.Section>
```

## 3. Authorization

### 3.1 Access Requirements

- **Required Scope:** `project:write`
- **Required Roles:** `project_admin` or `org_admin`
- **Project Context:** Active project must be selected (enforced by `OrgAndProjectGate`)

### 3.2 Behavior for Unauthorized Users

- Users without `project:write` should see settings in read-only mode
- All form inputs and action buttons should be disabled
- Display info banner: "You don't have permission to modify project settings. Contact your project administrator."

## 4. Template Pack Management

### 4.1 UI Layout

The template pack settings page (`/admin/settings/project/templates`) should display:

```
┌─────────────────────────────────────────────────────────────┐
│  Project Settings > Object Templates                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [ℹ] Object templates define the types of structured       │
│      objects you can create and extract from documents.     │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Installed Template Packs                              │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │                                                        │  │
│  │  ✓ TOGAF Architecture Framework                       │  │
│  │    • 47 object types (Requirements, Components, etc.) │  │
│  │    • Installed on Oct 3, 2025 by John Doe            │  │
│  │    [Configure] [Remove]                               │  │
│  │                                                        │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Available Template Packs                              │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │                                                        │  │
│  │  📦 Software Requirements Specification               │  │
│  │     • 12 object types                                 │  │
│  │     • Version 1.2.0                                   │  │
│  │     [Preview] [Install]                               │  │
│  │                                                        │  │
│  │  📦 Agile Product Management                          │  │
│  │     • 8 object types (Epic, Story, Task, etc.)       │  │
│  │     • Version 2.0.1                                   │  │
│  │     [Preview] [Install]                               │  │
│  │                                                        │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 API Endpoints

#### Get Installed Template Packs

```http
GET /template-packs/projects/:projectId/installed
Authorization: Bearer {token}
X-Project-ID: {projectId}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "assignmentId": "uuid",
      "templatePack": {
        "id": "uuid",
        "name": "TOGAF Architecture Framework",
        "version": "4.2.0",
        "description": "Enterprise architecture modeling objects",
        "objectTypes": [
          {
            "type": "Requirement",
            "description": "Business or technical requirement",
            "icon": "file-text",
            "count": 23
          },
          // ... more types
        ],
        "relationshipTypes": ["trace_to", "implements", "depends_on"]
      },
      "installedAt": "2025-10-03T10:30:00Z",
      "installedBy": "user-id",
      "active": true,
      "customizations": {
        "enabledTypes": ["Requirement", "Component"],
        "disabledTypes": ["BusinessProcess"]
      }
    }
  ]
}
```

#### Get Available Template Packs

```http
GET /template-packs/projects/:projectId/available
Authorization: Bearer {token}
X-Project-ID: {projectId}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Software Requirements Specification",
      "version": "1.2.0",
      "description": "SRS document object types",
      "objectTypes": [
        {
          "type": "FunctionalRequirement",
          "description": "System functional requirement",
          "icon": "check-square"
        }
      ],
      "relationshipTypes": ["depends_on", "trace_to"],
      "compatible": true,
      "installed": false
    }
  ]
}
```

#### Install Template Pack

```http
POST /template-packs/projects/:projectId/assign
Authorization: Bearer {token}
X-Project-ID: {projectId}
Content-Type: application/json

{
  "templatePackId": "uuid",
  "customizations": {
    "enabledTypes": ["Requirement", "Component"],
    "disabledTypes": []
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "assignmentId": "uuid",
    "installedTypes": ["Requirement", "Component", "..."],
    "conflicts": []
  }
}
```

#### Update Template Pack Configuration

```http
PATCH /template-packs/projects/:projectId/assignments/:assignmentId
Authorization: Bearer {token}
X-Project-ID: {projectId}
Content-Type: application/json

{
  "customizations": {
    "enabledTypes": ["Requirement", "Component"],
    "disabledTypes": ["BusinessProcess"]
  },
  "active": true
}
```

#### Remove Template Pack

```http
DELETE /template-packs/projects/:projectId/assignments/:assignmentId
Authorization: Bearer {token}
X-Project-ID: {projectId}
```

**Response:**
```json
{
  "success": true,
  "message": "Template pack removed successfully",
  "affectedObjects": 47
}
```

### 4.3 Template Pack Preview Modal

When clicking "Preview" on an available template pack, show a modal with:

```
┌─────────────────────────────────────────────────────────────┐
│  TOGAF Architecture Framework v4.2.0                    [×] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Enterprise architecture modeling based on TOGAF standard  │
│                                                             │
│  Object Types (47)                                          │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  📄 Business Layer (12 types)                              │
│     • Business Capability                                   │
│     • Business Process                                      │
│     • Business Service                                      │
│     • ...                                                   │
│                                                             │
│  🔧 Application Layer (15 types)                           │
│     • Application Component                                 │
│     • Application Service                                   │
│     • Data Object                                           │
│     • ...                                                   │
│                                                             │
│  💻 Technology Layer (8 types)                             │
│     • Technology Service                                    │
│     • Node (Infrastructure)                                 │
│     • System Software                                       │
│     • ...                                                   │
│                                                             │
│  🔗 Relationship Types (12)                                │
│     • realizes, serves, accesses, aggregates, triggers     │
│     • flows_to, depends_on, trace_to, ...                  │
│                                                             │
│  [Install Template Pack]  [Cancel]                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.4 Template Pack Configuration Modal

When clicking "Configure" on an installed pack:

```
┌─────────────────────────────────────────────────────────────┐
│  Configure: TOGAF Architecture Framework            [×]     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Enable/Disable Object Types                                │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  [×] Business Capability (23 objects)                      │
│  [×] Business Process (15 objects)                         │
│  [ ] Business Service (0 objects)                          │
│  [×] Application Component (31 objects)                    │
│  [ ] Application Service (2 objects)                       │
│  ...                                                        │
│                                                             │
│  ℹ️  Disabling a type will hide existing objects from      │
│     search but won't delete them. You can re-enable later. │
│                                                             │
│  [Save Changes]  [Cancel]                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.5 Confirmation Dialogs

#### Installing Template Pack

```
┌─────────────────────────────────────────────────────────────┐
│  Install Template Pack?                              [×]     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  You're about to install:                                   │
│  TOGAF Architecture Framework v4.2.0                       │
│                                                             │
│  This will add 47 new object types to your project.        │
│                                                             │
│  You can configure which types are enabled after           │
│  installation.                                              │
│                                                             │
│  [Install]  [Cancel]                                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Removing Template Pack

```
┌─────────────────────────────────────────────────────────────┐
│  Remove Template Pack?                               [×]     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ⚠️  Warning: This action cannot be undone!                │
│                                                             │
│  Removing "TOGAF Architecture Framework" will:             │
│  • Remove 47 object types from the type registry           │
│  • Mark 127 existing objects as "orphaned"                 │
│  • Existing objects won't be deleted but won't appear      │
│    in type-filtered searches                                │
│                                                             │
│  To permanently delete objects, do so before removing      │
│  the template pack.                                         │
│                                                             │
│  Type "REMOVE" to confirm:                                  │
│  [_________]                                                │
│                                                             │
│  [Remove Template Pack]  [Cancel]                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 5. General Project Settings

### 5.1 UI Layout

The general settings page (`/admin/settings/project/general`) should display:

```
┌─────────────────────────────────────────────────────────────┐
│  Project Settings > General                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Project Information                                        │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  Project Name *                                             │
│  [Enterprise Architecture Initiative_______________]        │
│                                                             │
│  Description                                                │
│  [Comprehensive EA program covering all business domains]  │
│  [including technology, applications, and business layers]  │
│  [_________________________________________________]        │
│                                                             │
│  Project ID                                                 │
│  abc123-def456-789 (read-only)                             │
│                                                             │
│  Created                                                    │
│  October 1, 2025 by John Doe (read-only)                   │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  [Save Changes]  [Cancel]                                   │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ Danger Zone                                            │ │
│  ├───────────────────────────────────────────────────────┤ │
│  │                                                        │ │
│  │  Delete Project                                        │ │
│  │  This will permanently delete all project data         │ │
│  │  including documents, objects, and relationships.      │ │
│  │                                                        │ │
│  │  [Delete Project]                                      │ │
│  │                                                        │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 API Endpoints

#### Get Project Details

```http
GET /projects/:projectId
Authorization: Bearer {token}
X-Org-ID: {orgId}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "orgId": "uuid",
    "name": "Enterprise Architecture Initiative",
    "description": "Comprehensive EA program...",
    "createdAt": "2025-10-01T10:00:00Z",
    "createdBy": {
      "id": "uuid",
      "name": "John Doe",
      "email": "john@example.com"
    },
    "status": "active"
  }
}
```

#### Update Project

```http
PATCH /projects/:projectId
Authorization: Bearer {token}
X-Org-ID: {orgId}
Content-Type: application/json

{
  "name": "Updated Project Name",
  "description": "Updated description"
}
```

## 6. UI Components

### 6.1 Component Structure

```
src/pages/admin/settings/
├── project/
│   ├── index.tsx                    # Main layout with tabs
│   ├── general.tsx                  # General settings tab
│   ├── templates.tsx                # Template pack management tab
│   └── components/
│       ├── TemplatePackCard.tsx     # Installed pack card
│       ├── AvailablePackCard.tsx    # Available pack card
│       ├── TemplatePackPreview.tsx  # Preview modal
│       ├── TemplatePackConfig.tsx   # Configuration modal
│       └── DeleteProjectDialog.tsx  # Delete confirmation
```

### 6.2 Atomic Design Adherence

Following the atomic design instructions:

**Atoms:**
- `Badge` (for type counts)
- `Icon` (for icons)
- `Button` (for actions)

**Molecules:**
- `SettingsSection` - A section with title and description
- `TemplateTypeItem` - Single object type row with checkbox

**Organisms:**
- `TemplatePackCard` - Complete card for installed pack
- `AvailablePackCard` - Complete card for available pack
- `TemplatePackPreview` - Full preview modal
- `TemplatePackConfig` - Full configuration modal

**Templates:**
- `ProjectSettingsLayout` - Tabbed layout for project settings

**Pages:**
- `ProjectSettingsGeneralPage`
- `ProjectSettingsTemplatesPage`

## 7. Implementation Notes

### 7.1 State Management

Use hooks for data fetching:

```typescript
// Custom hook for template packs
export function useTemplatePacks(projectId: string) {
  const { apiBase, buildHeaders } = useApi();
  
  const { data: installed, loading: loadingInstalled, error: errorInstalled } = 
    useFetch(`${apiBase}/template-packs/projects/${projectId}/installed`);
    
  const { data: available, loading: loadingAvailable, error: errorAvailable } = 
    useFetch(`${apiBase}/template-packs/projects/${projectId}/available`);
    
  return {
    installed: installed?.data || [],
    available: available?.data || [],
    loading: loadingInstalled || loadingAvailable,
    error: errorInstalled || errorAvailable
  };
}
```

### 7.2 Optimistic Updates

When installing/removing template packs, use optimistic updates:

```typescript
const installTemplatePack = async (packId: string) => {
  // Optimistically add to installed list
  setInstalled([...installed, optimisticPack]);
  
  try {
    const result = await fetch(`/template-packs/projects/${projectId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ templatePackId: packId })
    });
    
    // Update with real data
    refreshInstalled();
  } catch (error) {
    // Revert on error
    setInstalled(installed);
    showError('Failed to install template pack');
  }
};
```

### 7.3 Loading States

Show appropriate loading states:
- Skeleton loaders for template pack cards
- Loading spinner in buttons during async operations
- Disabled state for forms during submission

## 8. Testing Requirements

### 8.1 Unit Tests

- Template pack card rendering
- Configuration form validation
- Confirmation dialog logic
- API hook error handling

### 8.2 Integration Tests

- Load installed template packs
- Load available template packs
- Install new template pack
- Configure existing template pack
- Remove template pack with confirmation

### 8.3 E2E Tests (Playwright)

```typescript
test('should install template pack', async ({ page }) => {
  await test.step('Navigate to template settings', async () => {
    await page.goto('/admin/settings/project/templates');
    await expect(page.getByRole('heading', { name: 'Object Templates' })).toBeVisible();
  });
  
  await test.step('Install template pack', async () => {
    await page.getByRole('button', { name: 'Install' }).first().click();
    await page.getByRole('button', { name: 'Install' }).click(); // Confirmation
    await expect(page.getByText('Template pack installed successfully')).toBeVisible();
  });
  
  await test.step('Verify installed pack appears', async () => {
    await expect(page.getByText('Installed Template Packs')).toBeVisible();
    await expect(page.getByRole('heading', { name: /TOGAF/ })).toBeVisible();
  });
});
```

## 9. Comprehensive Project Settings Feature List

Based on analysis of all app features and specifications, here is the complete list of settings that should be available in project settings, organized by priority and implementation status:

### 9.1 Core Settings (High Priority - Spec Complete)

#### ✅ General Settings
- **Project Name** - Edit project name (max 100 chars)
- **Description** - Multi-line project description
- **Project ID** - Read-only UUID display
- **Created Info** - Read-only created date and creator
- **Delete Project** - Danger zone action with confirmation

#### ✅ Object Template Packs (docs/spec/24, docs/spec/38)
- **Install Template Packs** - Browse and install TOGAF, SRS, Agile, custom packs
- **Configure Installed Packs** - Enable/disable specific object types
- **Customize Type Definitions** - Modify JSON schemas per project
- **Remove Template Packs** - Uninstall with orphan handling
- **Preview Packs** - View full pack details before installation

### 9.2 Integrations (High Priority - Spec Complete)

#### ✅ ClickUp Integration (docs/spec/22, docs/spec/34)
- **Enable/Disable** - Toggle ClickUp sync
- **Space Mapping** - Map ClickUp Space to project (1:1)
- **API Token** - Secure credential storage
- **Type Mappings** - Configure ClickUp task → custom type mapping
- **Field Mappings** - Map custom fields to object properties
- **Sync Options** - Comments, attachments, subtasks, time tracking
- **Auto-Sync Schedule** - Configure sync interval
- **Sync Status** - Last sync time, status, error messages
- **Manual Sync Trigger** - Force immediate sync
- **View Sync Logs** - History of sync operations

#### 🔜 Integration Gallery (docs/spec/23)
- **Browse Available Integrations** - Grid of integration cards
- **Jira Integration** - Similar to ClickUp
- **GitHub Integration** - Issues, PRs, Discussions
- **Linear Integration** - Issue tracking
- **Confluence Integration** - Wiki/documentation sync
- **Notion Integration** - Page imports
- **Google Drive Integration** - File sync
- **SharePoint Integration** - Document library sync
- **Box Integration** - File storage sync
- **Slack Integration** - Message archives
- **Zoom/Meet/Teams Integration** - Meeting transcription

### 9.3 Access Control & Team (High Priority - Spec Complete)

#### ✅ Project Members (docs/spec/18 - Authorization Model)
- **View Members** - List all project members with roles
- **Invite Members** - Add users by email with role selection
  - project_admin - Full project control
  - project_user - Standard usage (read/search/chat)
- **Change Roles** - Promote/demote members
- **Remove Members** - Revoke project access
- **Pending Invitations** - View and manage sent invites
- **Cross-Org Invitations** - Invite users from other organizations

#### 🔜 Advanced Permissions
- **Custom Roles** - Define project-specific roles
- **Granular Scopes** - Fine-tune permissions (docs:write, chat:use, etc.)
- **API Keys** - Generate project-scoped API keys
- **Service Accounts** - Bot users for automation

### 9.4 Ingestion & Processing (Medium Priority)

#### 🔜 Document Processing Settings
- **Chunking Strategy** - Semantic, fixed, headings-aware
- **Chunk Size** - Configurable token limits
- **Chunk Overlap** - Overlap between chunks
- **Language Detection** - Enable/disable auto-detection
- **PII Redaction** - Configure PII handling
- **Text Extraction** - File type support (PDF, DOCX, etc.)

#### 🔜 Smart Extraction (docs/spec/24-26)
- **AI Extraction** - Enable/disable object extraction from documents
- **Extraction Prompt Templates** - Customize extraction prompts per type
- **Quality Thresholds** - Set confidence levels (0.0-1.0)
- **Entity Linking Strategy** - Configure merge strategies
  - exact_match_only
  - fuzzy_name_match
  - vector_similarity
- **Auto-Discovery** - Enable type discovery from patterns
- **Reprocessing Options** - Re-run extraction after schema changes

#### 🔜 Embedding & Indexing
- **Embedding Model** - Select provider (Google, OpenAI, custom)
- **Vector Dimensions** - 768, 1536, etc.
- **Index Configuration** - HNSW parameters for pgvector
- **Full-Text Search** - Enable/disable FTS indexing

### 9.5 AI & Chat Settings (Medium Priority)

#### ✅ AI Prompt Templates (docs/spec/12, existing)
- **System Prompts** - Configure chat system prompts
- **Extraction Prompts** - Templates for object extraction
- **Custom Instructions** - Per-project AI behavior

#### 🔜 Retrieval Configuration
- **Retrieval Mode** - Hybrid (default), vector-only, lexical-only
- **Top K Results** - Number of chunks to retrieve (default: 10)
- **Similarity Threshold** - Minimum similarity score (0.0-1.0)
- **Reranking** - Enable graph-aware reranking
- **Citation Format** - Customize citation display

#### 🔜 Chat Behavior
- **Default Visibility** - Shared vs Private conversations
- **Conversation Retention** - Auto-delete after N days
- **Max Tokens** - Response length limits
- **Temperature** - Model creativity (0.0-2.0)
- **Streaming** - Enable/disable SSE streaming

### 9.6 Notifications & Alerts (Low Priority)

#### 🔜 Project Notification Preferences (docs/spec/35)
- **Document Events** - New upload, processing complete, errors
- **Extraction Events** - Job complete, objects created, conflicts
- **Integration Events** - Sync complete, sync errors
- **Member Events** - New member joined, member left
- **Delivery Channels** - In-app, email, webhook
- **Importance Levels** - Configure what counts as "important"

### 9.7 Data & Storage (Low Priority)

#### 🔜 Retention Policies
- **Document Retention** - Auto-delete documents after N days
- **Chunk Retention** - Separate retention for processed chunks
- **Conversation Retention** - Auto-delete old chats
- **Object Retention** - Keep/purge extracted objects
- **Audit Log Retention** - How long to keep audit logs

#### 🔜 Storage Quotas
- **Document Storage Limit** - Max GB per project
- **Object Count Limit** - Max graph objects
- **Conversation Limit** - Max chat conversations
- **Member Limit** - Max team members

### 9.8 Advanced Settings (Low Priority)

#### 🔜 API & Webhooks
- **Webhook URLs** - Configure outbound webhooks for events
- **Webhook Events** - Select which events to send
- **API Rate Limits** - Project-specific rate limits
- **CORS Settings** - Configure allowed origins

#### 🔜 Security & Compliance
- **Encryption at Rest** - Enable additional encryption
- **Audit Logging** - Detailed activity logs
- **Data Export** - Download all project data
- **Data Residency** - Geographic data storage preferences
- **Compliance Tags** - GDPR, HIPAA, SOC2 markers

#### 🔜 Performance & Scaling
- **Concurrency Limits** - Max parallel ingestion jobs
- **Priority Queue** - Urgent vs normal processing
- **Resource Allocation** - Dedicated compute for large projects

### 9.9 Developer Settings (Low Priority)

#### 🔜 MCP Server Configuration
- **Enable MCP Interface** - Expose project via MCP protocol
- **MCP Resources** - Which resources to expose
- **MCP Tools** - Enable/disable specific tools
- **Service Auth** - MCP authentication tokens

#### 🔜 Custom Scripts
- **Post-Ingestion Scripts** - Run custom code after document processing
- **Validation Rules** - Custom object validation logic
- **Transformation Pipelines** - Data preprocessing hooks

### 9.10 Monitoring & Analytics (Future)

#### 🔜 Usage Metrics
- **Document Stats** - Upload frequency, processing time
- **Storage Usage** - Current usage vs quota
- **API Usage** - Request counts, rate limit hits
- **User Activity** - Active users, peak times
- **Cost Attribution** - LLM token usage, storage costs

#### 🔜 Quality Metrics
- **Extraction Accuracy** - Success rates, confidence scores
- **Search Quality** - Click-through rates, relevance
- **Chat Quality** - User satisfaction, regeneration rate

## 10. Future Enhancements

### 10.1 Custom Template Pack Creation

Allow users to create custom template packs:
- Define custom object types
- Export/import template packs
- Share template packs across projects

### 10.2 Template Pack Marketplace

- Browse community-contributed template packs
- Rate and review template packs
- Version management and updates

### 10.3 Settings Import/Export

- Export project settings as JSON
- Import settings from another project
- Project templates with pre-configured settings

## 10. Acceptance Criteria

- [ ] Project settings accessible from sidebar
- [ ] General settings page functional (name, description editing)
- [ ] Template packs page shows installed and available packs
- [ ] Can install new template pack with confirmation
- [ ] Can configure enabled types for installed pack
- [ ] Can remove template pack with strong confirmation
- [ ] Preview modal shows complete pack details
- [ ] Only users with `project:write` can modify settings
- [ ] All API endpoints implemented and tested
- [ ] UI follows atomic design structure
- [ ] Loading and error states handled gracefully
- [ ] Optimistic updates provide smooth UX
- [ ] E2E tests cover main workflows
- [ ] Responsive design works on mobile/tablet

---

**Next Steps:**
1. Implement backend endpoints (already exist per spec 24)
2. Create page components and routing
3. Build atomic UI components (cards, modals)
4. Add state management hooks
5. Write unit and integration tests
6. Add E2E test coverage
7. Update sidebar navigation
