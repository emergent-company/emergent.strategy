# Design: Google Drive Integration

## Context

This change adds Google Drive as a data source integration, enabling users to import files from their Google Drive into the knowledge base. The implementation builds on the existing OALF (OAuth Authorization Link Flow) mechanism used by Gmail integration.

**Stakeholders:**

- End users: Import documents from personal and team Google Drives
- Project admins: Configure which folders/drives to sync
- System: Process content through existing document pipeline
- Operations: Monitor sync jobs and quota usage

**Constraints:**

- Must reuse existing `GoogleOAuthService` for OAuth flows
- Must follow the `DataSourceProvider` interface pattern established by IMAP/Gmail
- Google Drive API has rate limits (10,000 queries per 100 seconds per user)
- Shared Drives (Team Drives) have different API patterns than My Drive
- Google Workspace files require export (Docs, Sheets, Slides)
- File downloads may be large; need streaming/chunking

## Goals / Non-Goals

**Goals:**

- Enable Google Drive file import as document source
- Support folder/path selection (all, specific folders, Shared Drives)
- Incremental sync using Drive change tokens
- Export Google Workspace documents to text formats
- Support both personal drives and Shared Drives
- Consistent UX with existing Gmail integration

**Non-Goals:**

- Write/upload back to Drive (read-only)
- Real-time push notifications (webhooks) - polling only for v1
- Google Photos integration
- Collaborative editing sync (only snapshots)
- Version history tracking (only current version)

## Decisions

### 1. Reuse GoogleOAuthService

**Decision:** Reuse the existing `GoogleOAuthService` with the 'drive' scope preset.

**Rationale:** The service already supports drive scopes and handles token refresh. The OAuth callback route can dispatch based on `state.provider` type.

```typescript
// Already exists in GoogleOAuthService
static readonly SCOPES = {
  drive: [
    'https://www.googleapis.com/auth/drive.readonly',  // Read-only Drive
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ],
};
```

### 2. Provider Configuration Model

**Decision:** Store folder selection and sync preferences in the encrypted config alongside OAuth tokens.

```typescript
interface GoogleDriveConfig {
  // OAuth tokens (same as Gmail)
  email: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;

  // Folder selection
  folderMode: 'all' | 'specific' | 'shared_drives';

  // For 'specific' mode
  selectedFolders?: Array<{
    id: string; // Drive folder ID
    name: string; // Display name for UI
    path: string; // Full path for reference
  }>;

  // For 'shared_drives' mode
  selectedSharedDrives?: Array<{
    id: string; // Shared Drive ID
    name: string; // Display name
  }>;

  // File filters
  fileFilters?: {
    mimeTypes?: string[]; // e.g., ['application/pdf', 'text/*']
    excludeMimeTypes?: string[]; // e.g., ['video/*', 'audio/*']
    maxFileSizeMB?: number; // Default 50MB
  };

  // Sync state
  changeToken?: string; // For incremental sync
  lastFullSyncAt?: number;
}
```

### 3. Folder Selection Modes

**Decision:** Support three folder selection modes to handle different use cases.

| Mode            | Use Case                           | API Pattern                                |
| --------------- | ---------------------------------- | ------------------------------------------ |
| `all`           | Sync everything user has access to | `files.list` with no parent filter         |
| `specific`      | Sync selected folders              | `files.list` with parent filter per folder |
| `shared_drives` | Sync Team Drives                   | `files.list` with `driveId` parameter      |

**Folder Picker UX:**

1. User connects OAuth
2. UI shows folder tree browser (lazy-loaded)
3. User checks folders to include
4. Selected folders stored in config

### 4. Sync Strategy: Change Tokens

**Decision:** Use Google Drive's change token API for efficient incremental sync.

**Initial Sync:**

```typescript
// Get starting point for changes
const response = await drive.changes.getStartPageToken({
  supportsAllDrives: true,
});
const startPageToken = response.data.startPageToken;

// List all files in selected folders
const files = await listAllFiles(config);

// Store token for incremental sync
config.changeToken = startPageToken;
```

**Incremental Sync:**

```typescript
// Get changes since last sync
const changes = await drive.changes.list({
  pageToken: config.changeToken,
  includeItemsFromAllDrives: true,
  supportsAllDrives: true,
});

// Process changes
for (const change of changes.data.changes) {
  if (change.removed) {
    // File was deleted - mark document as orphaned
  } else if (change.file) {
    // File was added/modified
    if (isInSelectedFolders(change.file)) {
      await processFile(change.file);
    }
  }
}

// Update token for next sync
config.changeToken = changes.data.newStartPageToken;
```

**Advantages:**

- Only fetches changes, not full file list
- Detects file modifications, additions, deletions
- Handles moves between folders

### 5. Google Workspace Export Formats

**Decision:** Export native Google formats to text for processing.

| Google Type     | Export Format              | Rationale                     |
| --------------- | -------------------------- | ----------------------------- |
| Google Docs     | Markdown (`text/markdown`) | Preserves formatting, headers |
| Google Sheets   | CSV (first sheet)          | Simple, parseable             |
| Google Slides   | Plain text                 | Extracts slide content        |
| Google Drawings | Skip                       | Not text-extractable          |

```typescript
const EXPORT_FORMATS: Record<string, string> = {
  'application/vnd.google-apps.document': 'text/markdown',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
  'application/vnd.google-apps.presentation': 'text/plain',
};

async function downloadFile(
  file: drive_v3.Schema$File
): Promise<Buffer | string> {
  if (file.mimeType?.startsWith('application/vnd.google-apps.')) {
    const exportMimeType = EXPORT_FORMATS[file.mimeType];
    if (!exportMimeType) return null; // Skip unsupported types

    const response = await drive.files.export({
      fileId: file.id,
      mimeType: exportMimeType,
    });
    return response.data as string;
  } else {
    // Regular file - download content
    const response = await drive.files.get(
      {
        fileId: file.id,
        alt: 'media',
      },
      { responseType: 'arraybuffer' }
    );
    return Buffer.from(response.data as ArrayBuffer);
  }
}
```

### 6. Shared Drive (Team Drive) Handling

**Decision:** Support Shared Drives as a distinct folder mode.

**API Differences:**

- Shared Drives require `supportsAllDrives: true` on all API calls
- Files in Shared Drives have different permission model
- Must specify `driveId` or `includeItemsFromAllDrives` parameter

```typescript
// List available Shared Drives
async function listSharedDrives(accessToken: string): Promise<SharedDrive[]> {
  const response = await drive.drives.list({
    pageSize: 100,
  });
  return response.data.drives.map((d) => ({
    id: d.id,
    name: d.name,
  }));
}

// List files in a Shared Drive
async function listFilesInSharedDrive(driveId: string): Promise<File[]> {
  const response = await drive.files.list({
    driveId,
    corpora: 'drive',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    q: `trashed = false`,
  });
  return response.data.files;
}
```

### 7. Rate Limiting Strategy

**Decision:** Implement respectful rate limiting to stay within Google API quotas.

**Quotas:**

- 10,000 queries per 100 seconds per user
- 10 queries per second per user
- 1,000,000 queries per day per project

**Implementation:**

```typescript
const RATE_LIMIT_CONFIG = {
  requestsPerSecond: 8, // Stay under 10 qps
  requestsPerMinute: 400, // Burst handling
  backoffOnRateLimit: true, // Exponential backoff on 429
  maxRetries: 3,
};

// Use p-queue or similar for rate limiting
const queue = new PQueue({
  intervalCap: RATE_LIMIT_CONFIG.requestsPerSecond,
  interval: 1000,
});
```

### 8. Document Metadata Storage

**Decision:** Store Drive-specific metadata in `integrationMetadata` field.

```typescript
interface DriveDocumentMetadata {
  // Drive identifiers
  driveFileId: string; // Google Drive file ID
  driveFolderId?: string; // Parent folder ID
  sharedDriveId?: string; // If from a Shared Drive

  // File info
  mimeType: string; // Original MIME type
  exportedMimeType?: string; // If Google Workspace file was exported
  fileSizeBytes: number;

  // Links
  webViewLink: string; // Link to view in Drive
  webContentLink?: string; // Direct download link (if available)

  // Timestamps
  driveCreatedTime: string;
  driveModifiedTime: string;

  // Path info
  folderPath: string; // Full path: "My Drive/Projects/2026"
}
```

### 9. Provider Interface Implementation

**Decision:** Implement `DataSourceProvider` interface following Gmail pattern.

```typescript
@Injectable()
export class GoogleDriveProvider implements DataSourceProvider {
  getMetadata(): ProviderMetadata {
    return {
      providerType: 'google_drive',
      displayName: 'Google Drive',
      description: 'Import documents from Google Drive',
      sourceType: 'drive',
      icon: 'lucide--hard-drive',
    };
  }

  async testConnection(
    config: GoogleDriveConfig
  ): Promise<TestConnectionResult> {
    // Verify token and list root to confirm access
  }

  async browse(
    config: GoogleDriveConfig,
    options: BrowseOptions
  ): Promise<BrowseResult> {
    // List folders/files for selection UI
  }

  async import(
    config: GoogleDriveConfig,
    items: ImportItem[],
    projectId: string,
    integrationId: string
  ): Promise<ImportResult> {
    // Download and create documents
  }

  async getNewItems(
    config: GoogleDriveConfig,
    since: Date,
    options?: SyncOptions
  ): Promise<ImportItem[]> {
    // Use change tokens for incremental sync
  }

  async getSyncPreview(
    config: GoogleDriveConfig,
    options?: SyncOptions,
    importedCount?: number,
    lastSyncedAt?: Date | null
  ): Promise<SyncPreviewResult> {
    // Return folder stats and file counts
  }
}
```

### 10. Duplicate Detection

**Decision:** Use Drive file ID + modification time for deduplication.

```typescript
// Check if document already imported
const existing = await documentRepo
  .createQueryBuilder('doc')
  .where('doc.projectId = :projectId', { projectId })
  .andWhere('doc.dataSourceIntegrationId = :integrationId', { integrationId })
  .andWhere("doc.metadata->>'driveFileId' = :fileId", { fileId: file.id })
  .getOne();

if (existing) {
  const existingModTime = existing.metadata?.driveModifiedTime;
  if (existingModTime === file.modifiedTime) {
    // Skip - no changes
    return { skipped: true };
  }
  // Update existing document
  return { update: existing.id };
}
// Create new document
return { create: true };
```

## Risks / Trade-offs

| Risk                                   | Mitigation                                           |
| -------------------------------------- | ---------------------------------------------------- |
| Large files exhaust memory             | Stream downloads, set 50MB default limit             |
| API rate limits hit during large syncs | Rate limiting queue, batch operations                |
| Token expiry during long sync          | Refresh token proactively, checkpoint progress       |
| Shared Drive permissions change        | Graceful handling of 403 errors during sync          |
| Google Workspace export quality        | Use Markdown for Docs, provide export format options |
| Folder tree too large to browse        | Lazy-load folders, search functionality              |
| Nested folder depth                    | Track full path, handle deeply nested structures     |

## Migration Plan

1. **Phase 1: Provider Implementation**

   - Create `GoogleDriveProvider` implementing `DataSourceProvider`
   - Add Google Drive API client wrapper
   - Implement folder listing and file download

2. **Phase 2: OAuth Integration**

   - Update OAuth callback to handle `google_drive` provider type
   - Add folder selection step after OAuth
   - Store folder config in encrypted settings

3. **Phase 3: Sync Implementation**

   - Implement change token-based incremental sync
   - Add sync preview with folder/file counts
   - Register provider in provider registry

4. **Phase 4: Frontend**
   - Add "Google Drive" option to integration creation
   - Build folder picker component
   - Add Drive-specific columns to documents table

**Rollback:** Disable Google Drive provider in registry. Existing documents remain but no new syncs.

## Open Questions

1. **Multi-sheet handling?** Export only first sheet, or all sheets as separate documents?

   - **Recommendation:** First sheet as CSV for v1, consider all sheets later

2. **Folder depth limit?** Should we limit how deep we traverse?

   - **Recommendation:** No hard limit, but warn if >1000 files in selection

3. **Trashed files?** Include recently trashed files in sync?

   - **Recommendation:** Exclude trashed files by default (q: `trashed = false`)

4. **Version history?** Should we track Google Docs revision history?
   - **Recommendation:** No for v1, only current version
