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
      // For public Google Docs/Sheets/Slides, we can use the export URL
      // which works without API authentication for publicly shared documents
      const exportUrl = this.getExportUrl(ref.externalId, ref.originalUrl);

      this.logger.log(
        `Checking access to: ${exportUrl} (original: ${ref.originalUrl})`
      );

      // Use HEAD request to check accessibility
      const response = await fetch(exportUrl, {
        method: 'HEAD',
        redirect: 'follow',
      });

      this.logger.log(
        `Access check response: status=${response.status}, ok=${response.ok}`
      );

      // Google returns 200 or redirects for accessible files
      if (response.ok) {
        // Try to extract name from the original URL or use a default
        const name =
          this.extractNameFromUrl(ref.originalUrl) || 'Google Document';

        return {
          accessible: true,
          metadata: {
            name,
            mimeType: this.getMimeTypeFromUrl(ref.originalUrl),
            size: 0, // We don't know size without API access
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

      this.logger.warn(
        `Unexpected response from Google export URL: ${response.status}`
      );
      return { accessible: false, reason: 'permission_denied' };
    } catch (error) {
      this.logger.error('Error checking Google Drive access', error);
      return { accessible: false, reason: 'network_error' };
    }
  }

  /**
   * Get the export URL for a Google file based on its type
   */
  private getExportUrl(fileId: string, originalUrl: string): string {
    // Determine the export format based on the original URL
    if (originalUrl.includes('docs.google.com/document')) {
      return `https://docs.google.com/document/d/${fileId}/export?format=txt`;
    }
    if (originalUrl.includes('docs.google.com/spreadsheets')) {
      return `https://docs.google.com/spreadsheets/d/${fileId}/export?format=csv`;
    }
    if (originalUrl.includes('docs.google.com/presentation')) {
      return `https://docs.google.com/presentation/d/${fileId}/export?format=pdf`;
    }
    if (originalUrl.includes('docs.google.com/drawings')) {
      return `https://docs.google.com/drawings/d/${fileId}/export?format=png`;
    }
    // Default to Drive download link for regular files
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  }

  /**
   * Extract document name from URL if possible
   */
  private extractNameFromUrl(url: string): string | null {
    // Google URLs don't typically contain the document name
    // Return null to use a default name
    return null;
  }

  /**
   * Get the expected mime type based on the URL
   */
  private getMimeTypeFromUrl(url: string): string {
    if (url.includes('docs.google.com/document')) {
      return 'application/vnd.google-apps.document';
    }
    if (url.includes('docs.google.com/spreadsheets')) {
      return 'application/vnd.google-apps.spreadsheet';
    }
    if (url.includes('docs.google.com/presentation')) {
      return 'application/vnd.google-apps.presentation';
    }
    if (url.includes('docs.google.com/drawings')) {
      return 'application/vnd.google-apps.drawing';
    }
    return 'application/octet-stream';
  }

  async fetchMetadata(ref: ExternalSourceReference): Promise<SourceMetadata> {
    // For public Google files, we use the export URL approach
    // We can't get detailed metadata without API access, so we provide defaults
    const mimeType = this.getMimeTypeFromUrl(ref.originalUrl);
    const exportFormat = GOOGLE_EXPORT_FORMATS[mimeType];

    return {
      name: 'Google Document', // Default name - we can't get the real name without API
      mimeType,
      size: 0, // Unknown without API access
      modifiedAt: new Date(),
      etag: undefined,
      providerMetadata: {
        googleFileId: ref.externalId,
        originalMimeType: mimeType,
        exportFormat: exportFormat?.mimeType || mimeType,
      },
    };
  }

  async fetchContent(ref: ExternalSourceReference): Promise<FetchedContent> {
    // Use the public export URL for Google files
    const exportUrl = this.getExportUrl(ref.externalId, ref.originalUrl);
    const mimeType = this.getMimeTypeFromUrl(ref.originalUrl);
    const exportFormat = GOOGLE_EXPORT_FORMATS[mimeType];

    this.logger.log(`Fetching content from: ${exportUrl}`);

    const response = await fetch(exportUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      throw new ExternalSourceError(
        ExternalSourceErrorCode.CONTENT_FETCH_FAILED,
        `Failed to fetch Google file: ${response.status} ${response.statusText}`
      );
    }

    // Try to extract filename from Content-Disposition header
    const contentDisposition = response.headers.get('content-disposition');
    let extractedFilename: string | null = null;
    if (contentDisposition) {
      // Match filename*=UTF-8''encoded_name or filename="name"
      const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
      const standardMatch = contentDisposition.match(/filename="([^"]+)"/i);
      if (utf8Match) {
        extractedFilename = decodeURIComponent(utf8Match[1]);
      } else if (standardMatch) {
        extractedFilename = standardMatch[1];
      }
      this.logger.log(`Extracted filename from header: ${extractedFilename}`);
    }

    let content: string | Buffer;
    let finalMimeType: string;
    let filename: string;

    if (exportFormat) {
      // Text content for docs and spreadsheets
      if (exportFormat.mimeType.startsWith('text/')) {
        content = await response.text();
      } else {
        // Binary content (PDF, PNG)
        content = Buffer.from(await response.arrayBuffer());
      }
      finalMimeType = exportFormat.mimeType;
      // Use extracted filename or fall back to generic name
      filename = extractedFilename || `document.${exportFormat.ext}`;
    } else {
      // Regular file download
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
      filename = extractedFilename || 'download';
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
