# Change: Add Google Drive Integration as Data Source

## Why

Users need to import documents from Google Drive into the knowledge base. The Gmail OAuth integration already demonstrates the OALF (OAuth Authorization Link Flow) mechanism for Google services, and users expect the same seamless experience for importing files from their Google Drive, including support for:

- Personal Google Drive folders
- Specific folder paths
- Shared Drives (Team Drives)
- Google Workspace documents (Docs, Sheets, Slides)

This enables organizations to leverage their existing cloud storage as a knowledge source without manual file downloads and uploads.

## What Changes

### 1. Google Drive Data Source Provider

- **NEW** `GoogleDriveProvider` implementing `DataSourceProvider` interface:
  - Reuses existing `GoogleOAuthService` (already supports 'drive' scope)
  - Integrates with Google Drive API v3 for browsing and downloading files
  - Supports incremental sync using Drive's change tokens
  - Exports Google Workspace documents (Docs, Sheets, Slides) to text/markdown

### 2. Folder Selection Configuration

- **NEW** Three folder selection modes:
  - **All folders**: Sync all files the user has access to
  - **Specific folders**: User selects one or more folders/paths to sync
  - **Shared Drives**: User selects specific Team Drives to sync
- Configuration stored in `DataSourceIntegration.configEncrypted` alongside OAuth tokens
- Frontend folder picker with folder tree browser

### 3. OAuth Flow Extension

- **MODIFIED** OAuth callback to support `google_drive` provider type
- **REUSE** existing `GoogleOAuthService.SCOPES.drive` for read-only access
- Store selected folders in integration config after OAuth completion

### 4. Sync Pattern

- **NEW** Change token-based incremental sync:
  - Store `startPageToken` after initial sync
  - Use `changes.list` API for subsequent syncs
  - Track file IDs to detect updates vs. new files
- **NEW** File filtering:
  - By MIME type (documents, spreadsheets, presentations, PDFs, text)
  - By folder path or Shared Drive
  - Exclude trashed files
- **MODIFIED** Sync preview to show folder hierarchy and file counts

### 5. Document Processing

- **NEW** Google Workspace export handling:
  - Google Docs → Markdown/plain text
  - Google Sheets → CSV (first sheet) or JSON (all sheets)
  - Google Slides → Plain text outline
- **NEW** Binary file handling:
  - PDFs, images, Office documents processed through existing pipeline
- **MODIFIED** Document metadata storage:
  - `integrationMetadata.driveFileId` - Google Drive file ID
  - `integrationMetadata.driveFolderId` - Parent folder ID
  - `integrationMetadata.mimeType` - Original MIME type
  - `integrationMetadata.webViewLink` - Link to view in Drive

## Impact

- **Affected specs:**

  - `google-drive-integration` (new capability) - Full provider implementation
  - `external-sources` - Minor updates for Drive provider registration

- **Affected code:**

  - `apps/server/src/modules/data-sources/providers/google-drive/` - **NEW** provider module
  - `apps/server/src/modules/data-sources/providers/gmail-oauth/google-oauth.service.ts` - Reused
  - `apps/server/src/modules/data-sources/data-source-integrations.controller.ts` - OAuth routes
  - `apps/server/src/modules/data-sources/data-source-integrations.service.ts` - Sync logic
  - `apps/admin/src/pages/admin/data-sources/integrations/` - Drive configuration UI

- **NOT breaking changes:**
  - Existing Gmail integration continues to work unchanged
  - Existing documents unaffected
  - OAuth callback URL shared with Gmail (handled by provider type in state)

## Design Considerations

See `design.md` for:

- Google Drive API patterns (vs. existing IMAP/Gmail patterns)
- Change token sync strategy
- Folder selection UX
- Shared Drive handling
- Rate limiting and quota management
- Export format decisions
