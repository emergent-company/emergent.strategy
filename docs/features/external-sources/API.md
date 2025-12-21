# External Sources API Reference

## Endpoints

### Import External Source

Import a document from an external URL into a project.

```
POST /api/external-sources/import
```

#### Request Body

```typescript
{
  url: string;           // Required: The URL to import
  projectId: string;     // Required: Target project UUID
  displayName?: string;  // Optional: Custom display name
  syncPolicy?: 'manual' | 'periodic';  // Optional: Default 'manual'
  syncIntervalMinutes?: number;        // Optional: For periodic sync
}
```

#### Response

```typescript
{
  id: string;                    // External source UUID
  status: 'created' | 'updated' | 'duplicate';
  documentId?: string;           // Created document UUID
  source: ExternalSourceDto;     // Full source details
  message: string;               // Human-readable status
}
```

#### Example

```bash
curl -X POST http://localhost:3002/api/external-sources/import \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://docs.google.com/document/d/1LnFOodCG2WRZZJ_HxZn9uvEt736xJ2KyQd_E1Ccuuaw/edit",
    "projectId": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

#### Response Example

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "created",
  "documentId": "f0e1d2c3-b4a5-6789-0abc-def123456789",
  "source": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "projectId": "550e8400-e29b-41d4-a716-446655440000",
    "providerType": "google_drive",
    "externalId": "1LnFOodCG2WRZZJ_HxZn9uvEt736xJ2KyQd_E1Ccuuaw",
    "originalUrl": "https://docs.google.com/document/d/1LnFOodCG2WRZZJ_HxZn9uvEt736xJ2KyQd_E1Ccuuaw/edit",
    "normalizedUrl": "https://drive.google.com/file/d/1LnFOodCG2WRZZJ_HxZn9uvEt736xJ2KyQd_E1Ccuuaw/view",
    "displayName": "Google Document",
    "mimeType": "application/vnd.google-apps.document",
    "syncPolicy": "manual",
    "status": "active",
    "lastSyncedAt": "2024-01-15T10:30:00.000Z",
    "createdAt": "2024-01-15T10:30:00.000Z"
  },
  "message": "Successfully imported document from Google Drive"
}
```

---

### Get External Source

Retrieve details of a specific external source.

```
GET /api/external-sources/:id
```

#### Path Parameters

| Parameter | Type | Description        |
| --------- | ---- | ------------------ |
| `id`      | UUID | External source ID |

#### Query Parameters

| Parameter   | Type | Description                            |
| ----------- | ---- | -------------------------------------- |
| `projectId` | UUID | Required: Project ID for authorization |

#### Response

```typescript
{
  id: string;
  projectId: string;
  providerType: 'google_drive' | 'url';
  externalId: string;
  originalUrl: string;
  normalizedUrl: string;
  displayName?: string;
  mimeType?: string;
  syncPolicy: 'manual' | 'periodic';
  syncIntervalMinutes?: number;
  lastCheckedAt?: string;
  lastSyncedAt?: string;
  lastEtag?: string;
  status: 'active' | 'error' | 'disabled';
  errorCount: number;
  lastError?: string;
  lastErrorAt?: string;
  createdAt: string;
  updatedAt: string;
}
```

---

### List External Sources

List external sources with optional filtering and pagination.

```
GET /api/external-sources
```

#### Query Parameters

| Parameter      | Type   | Description                                                |
| -------------- | ------ | ---------------------------------------------------------- |
| `projectId`    | UUID   | Required: Filter by project                                |
| `providerType` | string | Optional: Filter by provider ('google_drive', 'url')       |
| `status`       | string | Optional: Filter by status ('active', 'error', 'disabled') |
| `page`         | number | Optional: Page number (default: 1)                         |
| `limit`        | number | Optional: Items per page (default: 20, max: 100)           |

#### Response

```typescript
{
  items: ExternalSourceDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
```

---

### Trigger Manual Sync

Manually trigger a sync for an external source.

```
POST /api/external-sources/:id/sync
```

#### Path Parameters

| Parameter | Type | Description        |
| --------- | ---- | ------------------ |
| `id`      | UUID | External source ID |

#### Query Parameters

| Parameter   | Type | Description                            |
| ----------- | ---- | -------------------------------------- |
| `projectId` | UUID | Required: Project ID for authorization |

#### Response

```typescript
{
  id: string;
  status: 'synced' | 'no_changes' | 'error';
  documentId?: string;
  newVersion?: number;
  message: string;
}
```

---

### Delete External Source

Delete an external source. The associated document is NOT deleted.

```
DELETE /api/external-sources/:id
```

#### Path Parameters

| Parameter | Type | Description        |
| --------- | ---- | ------------------ |
| `id`      | UUID | External source ID |

#### Query Parameters

| Parameter   | Type | Description                            |
| ----------- | ---- | -------------------------------------- |
| `projectId` | UUID | Required: Project ID for authorization |

#### Response

```typescript
{
  success: boolean;
  message: string;
}
```

---

## Error Responses

All endpoints return standard error responses:

```typescript
{
  statusCode: number;
  message: string;
  error?: string;
}
```

### Common Error Codes

| Status Code | Description                             |
| ----------- | --------------------------------------- |
| 400         | Bad Request - Invalid input             |
| 401         | Unauthorized - Invalid or missing token |
| 403         | Forbidden - No access to project        |
| 404         | Not Found - Source not found            |
| 409         | Conflict - Duplicate source             |
| 422         | Unprocessable - URL not accessible      |
| 429         | Rate Limited - Too many requests        |
| 500         | Server Error - Internal error           |

### External Source Error Codes

The `message` field may contain these specific error codes:

| Code                    | Description                            |
| ----------------------- | -------------------------------------- |
| `SOURCE_NOT_ACCESSIBLE` | URL is not publicly accessible         |
| `SOURCE_NOT_FOUND`      | Resource not found at URL              |
| `RATE_LIMITED`          | Provider rate limit exceeded           |
| `UNSUPPORTED_TYPE`      | Unsupported file type                  |
| `FILE_TOO_LARGE`        | File exceeds size limit                |
| `NETWORK_ERROR`         | Network connectivity issue             |
| `PROVIDER_ERROR`        | Provider-specific error                |
| `AUTH_REQUIRED`         | Authentication required (private file) |

---

## DTOs

### ImportExternalSourceDto

```typescript
interface ImportExternalSourceDto {
  url: string; // Required
  projectId: string; // Required, UUID
  displayName?: string; // Optional
  syncPolicy?: 'manual' | 'periodic';
  syncIntervalMinutes?: number; // Required if syncPolicy is 'periodic'
}
```

### ExternalSourceResponseDto

```typescript
interface ExternalSourceResponseDto {
  id: string;
  projectId: string;
  providerType: string;
  externalId: string;
  originalUrl: string;
  normalizedUrl: string;
  displayName?: string;
  mimeType?: string;
  syncPolicy: string;
  syncIntervalMinutes?: number;
  lastCheckedAt?: string;
  lastSyncedAt?: string;
  status: string;
  errorCount: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}
```

### ExternalSourceListResponseDto

```typescript
interface ExternalSourceListResponseDto {
  items: ExternalSourceResponseDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
```
