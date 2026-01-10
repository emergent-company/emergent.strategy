# Tasks: Add Google Drive Integration

## 1. Backend: Provider Implementation

- [x] 1.1 Create `apps/server/src/modules/data-sources/providers/google-drive/` directory structure
- [x] 1.2 Create `google-drive.provider.ts` implementing `DataSourceProvider` interface
- [x] 1.3 Create `google-drive-config.dto.ts` with config validation (OAuth tokens + folder selection)
- [x] 1.4 Create `google-drive-api.service.ts` wrapper for Google Drive API v3
- [x] 1.5 Implement `testConnection()` - verify token and list root folder
- [x] 1.6 Implement `browse()` - list folders and files with pagination
- [x] 1.7 Implement `getNewItems()` - use change tokens for incremental sync
- [x] 1.8 Implement `import()` - download files and create documents
- [x] 1.9 Implement `getSyncPreview()` - folder stats and file counts
- [x] 1.10 Add Google Workspace export logic (Docs → Markdown, Sheets → CSV, Slides → text)
- [x] 1.11 Add rate limiting using p-queue (8 requests/second)
- [x] 1.12 Register `GoogleDriveProvider` in `DataSourcesModule`

## 2. Backend: OAuth Flow Updates

- [x] 2.1 Update `data-source-integrations.controller.ts` OAuth start to accept 'google_drive' providerType
- [x] 2.2 Update OAuth callback to handle 'google_drive' provider type in state
- [x] 2.3 Create integration with `google_drive` providerType and `drive` sourceType
- [ ] 2.4 Add folder configuration endpoint `POST /data-source-integrations/:id/configure-folders`
- [x] 2.5 Update OAuth status endpoint to include 'google_drive' in supported providers

## 3. Backend: Sync Implementation

- [x] 3.1 Implement change token storage in integration config
- [x] 3.2 Implement change token-based incremental sync in `triggerSync()`
- [x] 3.3 Add file duplicate detection by driveFileId + modifiedTime
- [x] 3.4 Handle file updates (update existing document vs create new)
- [x] 3.5 Store Drive-specific metadata (driveFileId, webViewLink, folderPath, etc.)
- [x] 3.6 Handle Shared Drive files with `supportsAllDrives` flag

## 4. Frontend: Integration UI

- [x] 4.1 Add "Google Drive" card to integration type selection (uses OAuth flow from gmail pattern)
- [x] 4.2 Create `FolderPicker` component for folder selection (implemented in SyncConfigModal)
- [ ] 4.3 Implement lazy-loading folder tree in picker (currently flat list from /browse)
- [ ] 4.4 Add Shared Drive listing tab in folder picker
- [ ] 4.5 Create folder mode selector (All / Specific / Shared Drives)
- [x] 4.6 Update `SyncConfigModal` to show Drive-specific options (folder checkboxes + limit slider)
- [ ] 4.7 Add file type filter configuration UI

## 5. Frontend: Documents Display

- [ ] 5.1 Add Drive-specific columns to documents table (Drive link, folder path)
- [ ] 5.2 Add Drive icon for documents with sourceType 'drive'
- [ ] 5.3 Show "View in Drive" link using webViewLink metadata

## 6. Testing

- [ ] 6.1 Unit tests for `GoogleDriveProvider` methods
- [ ] 6.2 Unit tests for Google Workspace export functions
- [ ] 6.3 Unit tests for change token sync logic
- [ ] 6.4 Unit tests for rate limiting behavior
- [ ] 6.5 E2E tests for OAuth flow (mock Google responses)
- [ ] 6.6 E2E tests for folder browsing and sync

## 7. Documentation

- [ ] 7.1 Add Google Drive setup instructions to integration docs
- [ ] 7.2 Document required Google Cloud Console configuration
- [ ] 7.3 Add troubleshooting guide for common Drive API errors
