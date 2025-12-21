# Adding New External Source Providers

This guide explains how to implement a new external source provider for the External Sources Framework.

## Overview

Providers are responsible for:

1. Detecting URLs they can handle
2. Parsing URLs into normalized references
3. Checking access permissions
4. Fetching content from the source
5. Detecting updates for sync

## Step-by-Step Implementation

### 1. Create the Provider Class

Create a new file in `apps/server/src/modules/external-sources/providers/`:

```typescript
// example: dropbox.provider.ts
import { Injectable, Logger } from '@nestjs/common';
import { SyncPolicy } from '../../../entities';
import {
  ExternalSourceProvider,
  ExternalSourceReference,
  AccessCheckResult,
  SourceMetadata,
  FetchedContent,
  UpdateCheckResult,
  RateLimitConfig,
  ExternalSourceError,
  ExternalSourceErrorCode,
} from '../interfaces';

@Injectable()
export class DropboxProvider implements ExternalSourceProvider {
  private readonly logger = new Logger(DropboxProvider.name);

  // Required: Unique provider identifier
  readonly providerType = 'dropbox' as const;

  // Required: Human-readable name
  readonly displayName = 'Dropbox';

  // URL patterns this provider handles
  private readonly patterns = [
    /https:\/\/www\.dropbox\.com\/s\/([a-z0-9]+)/,
    /https:\/\/www\.dropbox\.com\/scl\/fi\/([a-z0-9]+)/,
  ];

  // ... implement interface methods
}
```

### 2. Implement Required Methods

#### `canHandle(url: string): boolean`

Determine if this provider can handle the given URL.

```typescript
canHandle(url: string): boolean {
  return this.patterns.some(pattern => pattern.test(url));
}
```

#### `parseUrl(url: string): ExternalSourceReference | null`

Parse the URL and extract the external ID.

```typescript
parseUrl(url: string): ExternalSourceReference | null {
  for (const pattern of this.patterns) {
    const match = url.match(pattern);
    if (match) {
      const fileId = match[1];
      return {
        providerType: 'dropbox',
        externalId: fileId,
        originalUrl: url,
        normalizedUrl: `https://www.dropbox.com/s/${fileId}`,
      };
    }
  }
  return null;
}
```

#### `checkAccess(ref: ExternalSourceReference): Promise<AccessCheckResult>`

Verify the resource is accessible.

```typescript
async checkAccess(ref: ExternalSourceReference): Promise<AccessCheckResult> {
  try {
    const response = await fetch(ref.normalizedUrl, { method: 'HEAD' });

    if (response.ok) {
      return {
        accessible: true,
        metadata: {
          name: 'Dropbox File',
          mimeType: response.headers.get('content-type') || 'application/octet-stream',
          size: parseInt(response.headers.get('content-length') || '0'),
          modifiedAt: new Date(),
        },
      };
    }

    if (response.status === 404) {
      return { accessible: false, reason: 'not_found' };
    }
    if (response.status === 403 || response.status === 401) {
      return { accessible: false, reason: 'permission_denied' };
    }
    if (response.status === 429) {
      return { accessible: false, reason: 'rate_limited' };
    }

    return { accessible: false, reason: 'permission_denied' };
  } catch (error) {
    this.logger.error('Error checking access', error);
    return { accessible: false, reason: 'network_error' };
  }
}
```

#### `fetchMetadata(ref: ExternalSourceReference): Promise<SourceMetadata>`

Fetch metadata about the resource.

```typescript
async fetchMetadata(ref: ExternalSourceReference): Promise<SourceMetadata> {
  // For providers without API access, return defaults
  return {
    name: 'Dropbox File',
    mimeType: 'application/octet-stream',
    size: 0,
    modifiedAt: new Date(),
    etag: undefined,
    providerMetadata: {
      dropboxFileId: ref.externalId,
    },
  };
}
```

#### `fetchContent(ref: ExternalSourceReference): Promise<FetchedContent>`

Download the actual content.

```typescript
async fetchContent(ref: ExternalSourceReference): Promise<FetchedContent> {
  // Dropbox direct download URL pattern
  const downloadUrl = `${ref.normalizedUrl}?dl=1`;

  const response = await fetch(downloadUrl);

  if (!response.ok) {
    throw new ExternalSourceError(
      ExternalSourceErrorCode.CONTENT_FETCH_FAILED,
      `Failed to fetch: ${response.status}`
    );
  }

  const contentType = response.headers.get('content-type') || 'application/octet-stream';

  let content: string | Buffer;
  if (contentType.startsWith('text/') || contentType.includes('json')) {
    content = await response.text();
  } else {
    content = Buffer.from(await response.arrayBuffer());
  }

  return {
    content,
    mimeType: contentType,
    filename: 'download',
    encoding: 'utf-8',
  };
}
```

#### `checkForUpdates(...): Promise<UpdateCheckResult>`

Check if the resource has changed since last sync.

```typescript
async checkForUpdates(
  ref: ExternalSourceReference,
  lastSync: Date,
  lastEtag?: string
): Promise<UpdateCheckResult> {
  try {
    const metadata = await this.fetchMetadata(ref);

    const hasUpdates =
      metadata.modifiedAt > lastSync ||
      (lastEtag !== undefined && metadata.etag !== lastEtag);

    return {
      hasUpdates,
      newEtag: metadata.etag,
      newModifiedAt: metadata.modifiedAt,
    };
  } catch (error) {
    this.logger.error('Error checking for updates', error);
    return { hasUpdates: false };
  }
}
```

#### `getDefaultSyncPolicy(): SyncPolicy`

Return the default sync policy for this provider.

```typescript
getDefaultSyncPolicy(): SyncPolicy {
  return 'manual';  // or 'periodic'
}
```

#### `getRateLimitConfig(): RateLimitConfig`

Define rate limiting for this provider.

```typescript
getRateLimitConfig(): RateLimitConfig {
  return {
    requestsPerMinute: 60,
    requestsPerDay: 1000,
    backoffOnRateLimit: true,
  };
}
```

### 3. Register the Provider

Add the provider to the module in `external-sources.module.ts`:

```typescript
import { DropboxProvider } from './providers/dropbox.provider';

@Module({
  providers: [
    // ... existing providers
    DropboxProvider,
    {
      provide: 'EXTERNAL_SOURCE_PROVIDERS',
      useFactory: (
        googleDrive: GoogleDriveProvider,
        url: UrlProvider,
        dropbox: DropboxProvider // Add new provider
      ) => [googleDrive, url, dropbox],
      inject: [GoogleDriveProvider, UrlProvider, DropboxProvider],
    },
  ],
})
export class ExternalSourcesModule {}
```

### 4. Write Unit Tests

Create tests in `apps/server/tests/unit/external-sources/`:

```typescript
// dropbox.provider.spec.ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DropboxProvider } from '../../../src/modules/external-sources/providers/dropbox.provider';

describe('DropboxProvider', () => {
  let provider: DropboxProvider;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    provider = new DropboxProvider();
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('canHandle', () => {
    it('should handle Dropbox share URLs', () => {
      expect(
        provider.canHandle('https://www.dropbox.com/s/abc123/file.pdf')
      ).toBe(true);
    });

    it('should not handle non-Dropbox URLs', () => {
      expect(provider.canHandle('https://example.com/file.pdf')).toBe(false);
    });
  });

  describe('parseUrl', () => {
    it('should extract file ID from URL', () => {
      const ref = provider.parseUrl(
        'https://www.dropbox.com/s/abc123xyz/document.pdf?dl=0'
      );

      expect(ref?.providerType).toBe('dropbox');
      expect(ref?.externalId).toBe('abc123xyz');
    });
  });

  // ... more tests
});
```

### 5. Add E2E Tests (Optional)

If the provider supports real integration testing:

```typescript
// In external-sources.api.e2e.spec.ts
describe('Dropbox import', () => {
  it('should import a public Dropbox file', async () => {
    const response = await request(app)
      .post('/api/external-sources/import')
      .set('Authorization', `Bearer ${token}`)
      .send({
        url: 'https://www.dropbox.com/s/testfile123/test.pdf?dl=0',
        projectId,
      });

    expect(response.status).toBe(201);
    expect(response.body.source.providerType).toBe('dropbox');
  });
});
```

## Interface Reference

### ExternalSourceReference

```typescript
interface ExternalSourceReference {
  providerType: string; // Provider identifier
  externalId: string; // Provider-specific ID
  originalUrl: string; // URL as provided by user
  normalizedUrl: string; // Canonical URL form
}
```

### AccessCheckResult

```typescript
interface AccessCheckResult {
  accessible: boolean;
  reason?:
    | 'not_found'
    | 'permission_denied'
    | 'rate_limited'
    | 'network_error'
    | 'auth_required';
  metadata?: {
    name?: string;
    mimeType?: string;
    size?: number;
    modifiedAt?: Date;
  };
}
```

### SourceMetadata

```typescript
interface SourceMetadata {
  name: string;
  mimeType: string;
  size: number;
  modifiedAt: Date;
  etag?: string;
  providerMetadata?: Record<string, unknown>;
}
```

### FetchedContent

```typescript
interface FetchedContent {
  content: string | Buffer;
  mimeType: string;
  filename: string;
  encoding?: string;
}
```

### UpdateCheckResult

```typescript
interface UpdateCheckResult {
  hasUpdates: boolean;
  newEtag?: string;
  newModifiedAt?: Date;
}
```

### RateLimitConfig

```typescript
interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerDay: number;
  backoffOnRateLimit: boolean;
}
```

## Best Practices

1. **URL Normalization**: Always normalize URLs to a canonical form for deduplication
2. **Error Handling**: Use `ExternalSourceError` with appropriate error codes
3. **Logging**: Log important operations for debugging
4. **Rate Limiting**: Respect provider rate limits
5. **Graceful Degradation**: Return defaults when metadata isn't available
6. **Testing**: Write comprehensive unit tests for URL parsing edge cases

## Troubleshooting

### Common Issues

1. **Provider not detected**: Check URL patterns are correct
2. **Access denied**: Ensure public access URL format is used
3. **Content empty**: Verify download URL format
4. **Rate limiting**: Implement backoff and respect rate limits
