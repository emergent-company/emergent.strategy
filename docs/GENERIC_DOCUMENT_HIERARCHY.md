# Generic Document Hierarchy Pattern

## Overview

The knowledge base supports **hierarchical document structures** from ANY integration source. This is a **platform-level capability**, not specific to ClickUp, GitHub, or any single integration.

**Key Insight**: The database schema (`parent_document_id`, `integration_metadata`) is **100% generic** - any integration can import hierarchical data (wikis, repos, folders, pages) while preserving structure and metadata.

---

## Database Schema (Generic)

### kb.documents

```sql
CREATE TABLE kb.documents (
  id UUID PRIMARY KEY,
  
  -- Standard document fields
  source_url TEXT,
  filename TEXT,
  mime_type TEXT,
  content TEXT,
  content_hash TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  
  -- GENERIC HIERARCHY SUPPORT (works for ANY integration)
  parent_document_id UUID REFERENCES kb.documents(id) ON DELETE CASCADE,
  
  -- GENERIC METADATA STORAGE (JSONB can store anything)
  integration_metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for hierarchy queries
CREATE INDEX idx_documents_parent ON kb.documents(parent_document_id);
CREATE INDEX idx_documents_integration_metadata 
  ON kb.documents USING gin(integration_metadata);
```

**This schema doesn't know or care about the source** - it works equally well for:
- ✅ ClickUp Docs & Pages
- ✅ GitHub Repos & Files
- ✅ Confluence Spaces & Pages
- ✅ Notion Databases & Blocks
- ✅ Google Drive Folders & Documents
- ✅ Jira Projects & Issues
- ✅ Linear Teams & Issues

---

## Integration Metadata Examples

### ClickUp (Current Implementation)

```json
{
  "source": "clickup",
  "clickup_doc_id": "4bj41-33735",
  "clickup_page_id": "4bj41-22835",
  "workspace_id": "4573313",
  "parent_page_id": "4bj41-19415",
  "creator_id": 56506196,
  "date_created": "2024-01-15T10:30:00Z",
  "date_updated": "2024-03-20T14:45:00Z",
  "avatar": "emoji::📃",
  "cover": {"type": "color", "value": "#FF6900"},
  "archived": false,
  "protected": false
}
```

### GitHub (Example - Not Yet Implemented)

```json
{
  "source": "github",
  "repository": "eyedea-io/spec-server",
  "branch": "master",
  "commit_sha": "abc123...",
  "file_path": "src/modules/auth/auth.service.ts",
  "language": "typescript",
  "size_bytes": 4567,
  "last_modified_by": "octocat",
  "last_commit_date": "2024-03-15T14:30:00Z",
  "file_type": "source_code",
  "url": "https://github.com/eyedea-io/spec-server/blob/master/src/modules/auth/auth.service.ts"
}
```

### Confluence (Example - Not Yet Implemented)

```json
{
  "source": "confluence",
  "space_key": "TECH",
  "page_id": "12345678",
  "parent_page_id": "12345600",
  "version": 5,
  "content_type": "page",
  "created_by": "john.doe",
  "created_at": "2024-01-10T08:00:00Z",
  "updated_by": "jane.smith",
  "updated_at": "2024-03-18T11:20:00Z",
  "labels": ["documentation", "api"],
  "restrictions": {"read": ["developers"], "edit": ["admins"]},
  "url": "https://company.atlassian.net/wiki/spaces/TECH/pages/12345678"
}
```

### Notion (Example - Not Yet Implemented)

```json
{
  "source": "notion",
  "workspace_id": "workspace-uuid",
  "database_id": "database-uuid",
  "page_id": "page-uuid",
  "parent_page_id": "parent-uuid",
  "icon": {"type": "emoji", "emoji": "📚"},
  "cover": {"type": "external", "external": {"url": "https://..."}},
  "created_by": "user-uuid",
  "created_time": "2024-02-01T09:00:00Z",
  "last_edited_by": "user-uuid",
  "last_edited_time": "2024-03-22T16:45:00Z",
  "archived": false,
  "properties": {
    "Status": {"status": {"name": "In Progress"}},
    "Tags": {"multi_select": [{"name": "documentation"}]}
  },
  "url": "https://notion.so/page-uuid"
}
```

---

## Generic Data Mapping Pattern

### Step 1: Define Your Source Types

```typescript
// Example: GitHub types
export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string;
  updated_at: string;
}

export interface GitHubFile {
  path: string;
  sha: string;
  size: number;
  url: string;
  html_url: string;
  content: string; // Base64 encoded
  encoding: string;
}
```

### Step 2: Create Data Mapper

```typescript
import { Injectable } from '@nestjs/common';
import { InternalDocument } from '../integrations/document-hierarchy.types';

@Injectable()
export class GitHubDataMapper {
  /**
   * Map GitHub repository to internal document
   */
  mapRepository(repo: GitHubRepository, orgName: string): InternalDocument {
    return {
      external_id: `repo:${repo.id}`,
      external_type: 'github_repository',
      external_source: 'github',
      external_url: repo.html_url,
      external_parent_id: `org:${orgName}`,
      external_updated_at: new Date(repo.updated_at),
      title: repo.full_name,
      content: repo.description || `GitHub Repository: ${repo.name}`,
      metadata: {
        source: 'github',
        repository_id: repo.id,
        repository_name: repo.full_name,
        owner: orgName,
        url: repo.html_url,
      },
    };
  }

  /**
   * Map GitHub file to internal document
   */
  mapFile(
    file: GitHubFile,
    repoName: string,
    parentDirId?: string
  ): InternalDocument {
    const content = Buffer.from(file.content, 'base64').toString('utf-8');
    
    return {
      external_id: `blob:${file.sha}`,
      external_type: 'github_file',
      external_source: 'github',
      external_url: file.html_url,
      external_parent_id: parentDirId || `repo:${repoName}`,
      external_updated_at: undefined, // GitHub file API doesn't include this
      title: file.path.split('/').pop() || file.path,
      content: content,
      metadata: {
        source: 'github',
        repository: repoName,
        file_path: file.path,
        file_sha: file.sha,
        size_bytes: file.size,
        url: file.html_url,
        language: this.detectLanguage(file.path),
      },
    };
  }

  private detectLanguage(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      go: 'go',
      rs: 'rust',
      // ... more mappings
    };
    return languageMap[ext || ''] || 'unknown';
  }
}
```

### Step 3: Create Import Service

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { 
  InternalDocument, 
  HierarchicalImportContext 
} from '../integrations/document-hierarchy.types';

@Injectable()
export class GitHubImportService {
  private readonly logger = new Logger(GitHubImportService.name);

  async importRepository(
    repoFullName: string,
    projectId: string,
    orgId: string,
    integrationId: string
  ): Promise<void> {
    // Context for tracking hierarchy
    const context: HierarchicalImportContext = {
      externalIdMap: new Map(),
      depth: 0,
      maxDepth: 10,
    };

    // 1. Fetch repo metadata
    const repo = await this.apiClient.getRepository(repoFullName);
    const repoDoc = this.dataMapper.mapRepository(repo, orgId);
    
    // 2. Store repo document
    const repoDocId = await this.storeDocument(
      projectId, 
      orgId, 
      integrationId, 
      repoDoc
    );
    context.externalIdMap.set(repoDoc.external_id, repoDocId);

    // 3. Recursively import directory tree
    await this.importDirectoryTree(
      repoFullName,
      '', // root path
      `repo:${repo.id}`,
      projectId,
      orgId,
      integrationId,
      context
    );
  }

  private async importDirectoryTree(
    repoFullName: string,
    path: string,
    parentExternalId: string,
    projectId: string,
    orgId: string,
    integrationId: string,
    context: HierarchicalImportContext
  ): Promise<void> {
    // Recursion depth check
    if (context.depth >= (context.maxDepth || 10)) {
      this.logger.warn(`Max depth reached at ${path}`);
      return;
    }

    // Fetch directory contents
    const contents = await this.apiClient.getDirectoryContents(
      repoFullName, 
      path
    );

    for (const item of contents) {
      if (item.type === 'file') {
        // Map and store file
        const fileContent = await this.apiClient.getFileContent(
          repoFullName, 
          item.path
        );
        const fileDoc = this.dataMapper.mapFile(
          fileContent, 
          repoFullName, 
          parentExternalId
        );
        
        const fileDocId = await this.storeDocument(
          projectId, 
          orgId, 
          integrationId, 
          fileDoc,
          context.externalIdMap.get(parentExternalId) // parent UUID
        );
        context.externalIdMap.set(fileDoc.external_id, fileDocId);

      } else if (item.type === 'dir') {
        // Recursively import subdirectory
        await this.importDirectoryTree(
          repoFullName,
          item.path,
          `tree:${item.sha}`,
          projectId,
          orgId,
          integrationId,
          { ...context, depth: context.depth + 1 }
        );
      }
    }
  }

  private async storeDocument(
    projectId: string,
    orgId: string,
    integrationId: string,
    doc: InternalDocument,
    parentDocumentId?: string
  ): Promise<string> {
    // Store in kb.documents with parent reference
    const result = await this.db.query(
      `INSERT INTO kb.documents (
        project_id, org_id, 
        source_url, filename, content,
        parent_document_id, integration_metadata,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING id`,
      [
        projectId,
        orgId,
        doc.external_url,
        doc.title,
        doc.content,
        parentDocumentId || null,
        JSON.stringify(doc.metadata),
      ]
    );
    
    return result.rows[0].id;
  }
}
```

---

## Querying Hierarchical Documents

### Get All Children

```sql
SELECT * FROM kb.documents 
WHERE parent_document_id = 'parent-uuid';
```

### Get Full Tree (Recursive CTE)

```sql
WITH RECURSIVE doc_tree AS (
  -- Base: root documents
  SELECT 
    id, 
    parent_document_id, 
    integration_metadata->>'source' as source,
    integration_metadata,
    0 as level
  FROM kb.documents
  WHERE integration_metadata->>'source' = 'github'
    AND parent_document_id IS NULL
  
  UNION ALL
  
  -- Recursive: child documents
  SELECT 
    d.id, 
    d.parent_document_id,
    d.integration_metadata->>'source' as source,
    d.integration_metadata,
    dt.level + 1
  FROM kb.documents d
  JOIN doc_tree dt ON d.parent_document_id = dt.id
  WHERE dt.level < 10  -- Prevent infinite recursion
)
SELECT * FROM doc_tree ORDER BY level, id;
```

### Find Documents by Integration

```sql
-- All ClickUp docs
SELECT * FROM kb.documents
WHERE integration_metadata->>'source' = 'clickup';

-- All GitHub files
SELECT * FROM kb.documents
WHERE integration_metadata->>'source' = 'github';

-- All Confluence pages in specific space
SELECT * FROM kb.documents
WHERE integration_metadata->>'source' = 'confluence'
  AND integration_metadata->>'space_key' = 'TECH';
```

### Find Documents by External ID

```sql
SELECT * FROM kb.documents
WHERE integration_metadata->>'clickup_doc_id' = '4bj41-33735';

-- Or for GitHub
WHERE integration_metadata->>'file_sha' = 'abc123...';
```

---

## UI Patterns (Generic)

### Document Tree Component

```tsx
interface DocumentTreeProps {
  documents: Document[];
  source?: string; // Filter by integration source
}

export function DocumentTree({ documents, source }: DocumentTreeProps) {
  // Build tree from flat list using parent_document_id
  const tree = buildTree(documents);
  
  return (
    <div className="document-tree">
      {tree.map(node => (
        <DocumentNode 
          key={node.id}
          document={node}
          source={source}
        />
      ))}
    </div>
  );
}

interface DocumentNodeProps {
  document: Document & { children?: Document[] };
  source?: string;
}

function DocumentNode({ document, source }: DocumentNodeProps) {
  const metadata = document.integrationMetadata;
  
  // Render source-specific icons/avatars
  const icon = getSourceIcon(metadata);
  
  return (
    <div className="document-node">
      <div className="node-header">
        {icon}
        <span>{document.name}</span>
        <SourceBadge source={metadata.source} />
      </div>
      
      {document.children && document.children.length > 0 && (
        <div className="node-children">
          {document.children.map(child => (
            <DocumentNode key={child.id} document={child} source={source} />
          ))}
        </div>
      )}
    </div>
  );
}

function getSourceIcon(metadata: Record<string, any>) {
  switch (metadata.source) {
    case 'clickup':
      return metadata.avatar || '📄';
    case 'github':
      return metadata.language === 'typescript' ? '📘' : '📄';
    case 'confluence':
      return '📚';
    case 'notion':
      return metadata.icon?.emoji || '📝';
    default:
      return '📄';
  }
}
```

---

## Benefits of Generic Approach

### 1. **Consistency**
- All integrations use the same database schema
- All integrations use the same DTO fields
- All integrations follow the same patterns

### 2. **Flexibility**
- JSONB metadata can store ANY source-specific fields
- No schema changes needed for new integrations
- Easy to add new integrations

### 3. **Powerful Queries**
- Query across ALL integrations at once
- Filter by source, parent, metadata fields
- Build cross-integration relationships

### 4. **Reusability**
- UI components work for all integrations
- Search/extraction works the same way
- Graph visualization is source-agnostic

---

## Integration Checklist

To add hierarchical document support to a new integration:

- [ ] Define source-specific types (e.g., `GitHubFile`, `ConfluencePage`)
- [ ] Create data mapper implementing `InternalDocument` interface
- [ ] Create import service using `HierarchicalImportContext`
- [ ] Use `parent_document_id` for hierarchy
- [ ] Store source metadata in `integration_metadata` JSONB
- [ ] Add pagination support for large datasets
- [ ] Implement incremental sync (check `external_updated_at`)
- [ ] Add UI to display hierarchy (optional)
- [ ] Enable extraction on imported documents

**No database migrations needed!** The schema is already generic.

---

## Real-World Examples

### ClickUp (Implemented ✅)

```
Workspace 4573313
└─ Space "Huma" (90152846670)
   └─ Doc "Tech Glossary" (4bj41-33735)
      ├─ Page "Introduction" (4bj41-22835)
      │  ├─ Sub-page "Getting Started"
      │  └─ Sub-page "Prerequisites"
      ├─ Page "Architecture"
      └─ Page "API Reference"
```

### GitHub (Example)

```
Organization "eyedea-io"
└─ Repository "spec-server"
   ├─ README.md
   ├─ src/
   │  ├─ modules/
   │  │  ├─ auth/
   │  │  │  ├─ auth.service.ts
   │  │  │  └─ auth.controller.ts
   │  │  └─ documents/
   │  └─ main.ts
   └─ package.json
```

### Confluence (Example)

```
Space "TECH"
└─ Page "Development Guide"
   ├─ Child Page "Getting Started"
   ├─ Child Page "Architecture"
   │  ├─ Child Page "Backend"
   │  └─ Child Page "Frontend"
   └─ Child Page "Deployment"
```

---

## Summary

**The hierarchical document system is 100% generic**:

✅ **Database schema**: Generic (parent_document_id, integration_metadata)  
✅ **DTO fields**: Generic (parentDocumentId, integrationMetadata)  
✅ **InternalDocument interface**: Generic (works for any source)  
✅ **Query patterns**: Source-agnostic  
✅ **UI components**: Reusable across integrations  

**Only integration-specific parts**:
- API clients (each source has different endpoints)
- Data mappers (each source has different data structures)
- Metadata contents (stored in generic JSONB field)

**Result**: Any integration can import hierarchical data with ~200 lines of code, no schema changes required!
