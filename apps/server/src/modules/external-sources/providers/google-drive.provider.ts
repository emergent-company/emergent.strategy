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

/**
 * Google Drive export formats for native Google file types
 */
const GOOGLE_EXPORT_FORMATS: Record<string, { mimeType: string; ext: string }> =
  {
    'application/vnd.google-apps.document': {
      mimeType: 'text/plain',
      ext: 'txt',
    },
    'application/vnd.google-apps.spreadsheet': {
      mimeType: 'text/csv',
      ext: 'csv',
    },
    'application/vnd.google-apps.presentation': {
      mimeType: 'application/pdf',
      ext: 'pdf',
    },
    'application/vnd.google-apps.drawing': {
      mimeType: 'image/png',
      ext: 'png',
    },
  };

/**
 * Google Drive Provider
 *
 * Supports importing public/shared files from Google Drive.
 * Works with direct file links and Google Docs/Sheets/Slides.
 *
 * URL formats supported:
 * - https://drive.google.com/file/d/{fileId}/view
 * - https://drive.google.com/open?id={fileId}
 * - https://docs.google.com/document/d/{fileId}/edit
 * - https://docs.google.com/spreadsheets/d/{fileId}/edit
 * - https://docs.google.com/presentation/d/{fileId}/edit
 */
@Injectable()
export class GoogleDriveProvider implements ExternalSourceProvider {
  private readonly logger = new Logger(GoogleDriveProvider.name);

  readonly providerType = 'google_drive' as const;
  readonly displayName = 'Google Drive';

  /**
   * URL patterns for Google Drive and Google Docs
   */
  private readonly patterns = [
    // Google Drive file links
    /https:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
    /https:\/\/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
    // Google Docs
    /https:\/\/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/,
    // Google Sheets
    /https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/,
    // Google Slides
    /https:\/\/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/,
    // Google Drawings
    /https:\/\/docs\.google\.com\/drawings\/d\/([a-zA-Z0-9_-]+)/,
  ];

  canHandle(url: string): boolean {
    return this.patterns.some((pattern) => pattern.test(url));
  }

  parseUrl(url: string): ExternalSourceReference | null {
    for (const pattern of this.patterns) {
      const match = url.match(pattern);
      if (match) {
        const fileId = match[1];
        return {
          providerType: 'google_drive',
          externalId: fileId,
          originalUrl: url,
          normalizedUrl: `https://drive.google.com/file/d/${fileId}/view`,
        };
      }
    }
    return null;
  }

  async checkAccess(ref: ExternalSourceReference): Promise<AccessCheckResult> {
    try {
      // Use the Google Drive API to check if the file exists and is accessible
      // For public files, we can use the /files/{fileId} endpoint without auth
      const apiUrl = `https://www.googleapis.com/drive/v3/files/${ref.externalId}?fields=id,name,mimeType,size,modifiedTime,capabilities`;

      const response = await fetch(apiUrl);

      if (response.ok) {
        const data = await response.json();
        return {
          accessible: true,
          metadata: {
            name: data.name,
            mimeType: data.mimeType,
            size: parseInt(data.size || '0', 10),
            modifiedAt: new Date(data.modifiedTime),
          },
        };
      }

      if (response.status === 404) {
        return { accessible: false, reason: 'not_found' };
      }

      if (response.status === 403) {
        return { accessible: false, reason: 'permission_denied' };
      }

      if (response.status === 429) {
        return { accessible: false, reason: 'rate_limited' };
      }

      this.logger.warn(
        `Unexpected response from Google Drive API: ${response.status}`
      );
      return { accessible: false, reason: 'permission_denied' };
    } catch (error) {
      this.logger.error('Error checking Google Drive access', error);
      return { accessible: false, reason: 'network_error' };
    }
  }

  async fetchMetadata(ref: ExternalSourceReference): Promise<SourceMetadata> {
    const apiUrl = `https://www.googleapis.com/drive/v3/files/${ref.externalId}?fields=id,name,mimeType,size,modifiedTime,md5Checksum`;

    const response = await fetch(apiUrl);

    if (!response.ok) {
      throw new ExternalSourceError(
        ExternalSourceErrorCode.SOURCE_NOT_ACCESSIBLE,
        `Failed to fetch metadata: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();

    return {
      name: data.name,
      mimeType: data.mimeType,
      size: parseInt(data.size || '0', 10),
      modifiedAt: new Date(data.modifiedTime),
      etag: data.md5Checksum || data.modifiedTime,
      providerMetadata: {
        googleFileId: data.id,
        originalMimeType: data.mimeType,
      },
    };
  }

  async fetchContent(ref: ExternalSourceReference): Promise<FetchedContent> {
    // First, get the file metadata to determine the type
    const metadata = await this.fetchMetadata(ref);
    const mimeType = metadata.mimeType;

    // Check if it's a Google native format that needs export
    const exportFormat = GOOGLE_EXPORT_FORMATS[mimeType];

    let content: string | Buffer;
    let finalMimeType: string;
    let filename: string;

    if (exportFormat) {
      // Export Google native format
      const exportUrl = `https://www.googleapis.com/drive/v3/files/${
        ref.externalId
      }/export?mimeType=${encodeURIComponent(exportFormat.mimeType)}`;

      const response = await fetch(exportUrl);

      if (!response.ok) {
        throw new ExternalSourceError(
          ExternalSourceErrorCode.CONTENT_FETCH_FAILED,
          `Failed to export Google file: ${response.status} ${response.statusText}`
        );
      }

      content = await response.text();
      finalMimeType = exportFormat.mimeType;
      filename = `${metadata.name}.${exportFormat.ext}`;
    } else {
      // Direct download for regular files
      const downloadUrl = `https://www.googleapis.com/drive/v3/files/${ref.externalId}?alt=media`;

      const response = await fetch(downloadUrl);

      if (!response.ok) {
        throw new ExternalSourceError(
          ExternalSourceErrorCode.CONTENT_FETCH_FAILED,
          `Failed to download file: ${response.status} ${response.statusText}`
        );
      }

      // Check content type to determine if text or binary
      const contentType =
        response.headers.get('content-type') || 'application/octet-stream';

      if (
        contentType.startsWith('text/') ||
        contentType.includes('json') ||
        contentType.includes('xml')
      ) {
        content = await response.text();
      } else {
        content = Buffer.from(await response.arrayBuffer());
      }

      finalMimeType = contentType;
      filename = metadata.name;
    }

    return {
      content,
      mimeType: finalMimeType,
      filename,
      encoding: 'utf-8',
    };
  }

  async checkForUpdates(
    ref: ExternalSourceReference,
    lastSync: Date,
    lastEtag?: string
  ): Promise<UpdateCheckResult> {
    try {
      const metadata = await this.fetchMetadata(ref);

      // Check if modified since last sync
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
      // If we can't check, assume no updates
      return { hasUpdates: false };
    }
  }

  getDefaultSyncPolicy(): SyncPolicy {
    // Default to manual sync for Google Drive files
    // since they may be updated frequently and we don't want to
    // overwhelm the API
    return 'manual';
  }

  getRateLimitConfig(): RateLimitConfig {
    return {
      requestsPerMinute: 60,
      requestsPerDay: 1000,
      backoffOnRateLimit: true,
    };
  }
}
