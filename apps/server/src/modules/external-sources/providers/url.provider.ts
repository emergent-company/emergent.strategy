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
 * Default request headers for URL fetching
 * Uses browser-like headers to avoid bot blocking
 */
const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
};

/**
 * Request timeout in milliseconds
 */
const REQUEST_TIMEOUT = 30000;

/**
 * Maximum file size to download (50MB)
 */
const MAX_FILE_SIZE = 50 * 1024 * 1024;

/**
 * Generic URL Provider
 *
 * Handles importing content from any publicly accessible URL.
 * Supports HTML pages (converted to text), JSON, XML, and other text formats.
 * Can also handle binary downloads like PDFs.
 *
 * This is the fallback provider used when no specific provider (Google Drive, etc.) matches.
 */
@Injectable()
export class UrlProvider implements ExternalSourceProvider {
  private readonly logger = new Logger(UrlProvider.name);

  readonly providerType = 'url' as const;
  readonly displayName = 'Web URL';

  /**
   * URL Provider can handle any valid HTTP/HTTPS URL
   */
  canHandle(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  parseUrl(url: string): ExternalSourceReference | null {
    if (!this.canHandle(url)) {
      return null;
    }

    try {
      const parsed = new URL(url);

      // Normalize the URL by removing common tracking parameters
      const normalized = new URL(parsed.origin + parsed.pathname);

      // Keep only essential query parameters (remove utm_, fbclid, etc.)
      for (const [key, value] of parsed.searchParams) {
        if (
          !key.startsWith('utm_') &&
          !['fbclid', 'gclid', 'ref', 'source'].includes(key.toLowerCase())
        ) {
          normalized.searchParams.set(key, value);
        }
      }

      // Sort query params for consistent normalization
      normalized.searchParams.sort();

      return {
        providerType: 'url',
        externalId: this.generateExternalId(normalized.toString()),
        originalUrl: url,
        normalizedUrl: normalized.toString(),
      };
    } catch {
      return null;
    }
  }

  /**
   * Generate a stable external ID from a URL
   * Uses a hash of the normalized URL
   */
  private generateExternalId(normalizedUrl: string): string {
    // Simple hash function for generating stable IDs
    let hash = 0;
    for (let i = 0; i < normalizedUrl.length; i++) {
      const char = normalizedUrl.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `url_${Math.abs(hash).toString(36)}`;
  }

  async checkAccess(ref: ExternalSourceReference): Promise<AccessCheckResult> {
    try {
      // Use HEAD request to check accessibility without downloading content
      const response = await fetch(ref.normalizedUrl, {
        method: 'HEAD',
        headers: DEFAULT_HEADERS,
        redirect: 'follow',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });

      if (response.ok) {
        const contentType = response.headers.get('content-type') || 'text/html';
        const contentLength = response.headers.get('content-length');
        const lastModified = response.headers.get('last-modified');
        const etag = response.headers.get('etag');

        return {
          accessible: true,
          metadata: {
            name: this.extractNameFromUrl(ref.normalizedUrl),
            mimeType: contentType.split(';')[0].trim(),
            size: contentLength ? parseInt(contentLength, 10) : 0,
            modifiedAt: lastModified ? new Date(lastModified) : new Date(),
            etag: etag || undefined,
          },
        };
      }

      return this.mapHttpStatusToAccessResult(response.status);
    } catch (error) {
      this.logger.error(
        `Error checking access for URL: ${ref.normalizedUrl}`,
        error
      );

      if (error instanceof Error && error.name === 'TimeoutError') {
        return { accessible: false, reason: 'network_error' };
      }

      return { accessible: false, reason: 'network_error' };
    }
  }

  /**
   * Map HTTP status codes to AccessCheckResult reasons
   */
  private mapHttpStatusToAccessResult(status: number): AccessCheckResult {
    switch (status) {
      case 401:
      case 403:
        return { accessible: false, reason: 'permission_denied' };
      case 404:
      case 410:
        return { accessible: false, reason: 'not_found' };
      case 429:
        return { accessible: false, reason: 'rate_limited' };
      default:
        this.logger.warn(`Unexpected HTTP status: ${status}`);
        return { accessible: false, reason: 'network_error' };
    }
  }

  async fetchMetadata(ref: ExternalSourceReference): Promise<SourceMetadata> {
    const response = await fetch(ref.normalizedUrl, {
      method: 'HEAD',
      headers: DEFAULT_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });

    if (!response.ok) {
      throw new ExternalSourceError(
        ExternalSourceErrorCode.SOURCE_NOT_ACCESSIBLE,
        `Failed to fetch metadata: ${response.status} ${response.statusText}`
      );
    }

    const contentType = response.headers.get('content-type') || 'text/html';
    const contentLength = response.headers.get('content-length');
    const lastModified = response.headers.get('last-modified');
    const etag = response.headers.get('etag');

    // Check file size limit
    if (contentLength && parseInt(contentLength, 10) > MAX_FILE_SIZE) {
      throw new ExternalSourceError(
        ExternalSourceErrorCode.FILE_TOO_LARGE,
        `File size ${contentLength} bytes exceeds maximum allowed ${MAX_FILE_SIZE} bytes`
      );
    }

    return {
      name: this.extractNameFromUrl(ref.normalizedUrl),
      mimeType: contentType.split(';')[0].trim(),
      size: contentLength ? parseInt(contentLength, 10) : 0,
      modifiedAt: lastModified ? new Date(lastModified) : new Date(),
      etag: etag || undefined,
      providerMetadata: {
        finalUrl: response.url, // URL after redirects
        server: response.headers.get('server') || undefined,
      },
    };
  }

  async fetchContent(ref: ExternalSourceReference): Promise<FetchedContent> {
    const response = await fetch(ref.normalizedUrl, {
      method: 'GET',
      headers: DEFAULT_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });

    if (!response.ok) {
      throw new ExternalSourceError(
        ExternalSourceErrorCode.CONTENT_FETCH_FAILED,
        `Failed to fetch content: ${response.status} ${response.statusText}`
      );
    }

    const contentType =
      response.headers.get('content-type') || 'application/octet-stream';
    const mimeType = contentType.split(';')[0].trim();

    // Determine if this is text content
    const isText =
      mimeType.startsWith('text/') ||
      mimeType.includes('json') ||
      mimeType.includes('xml') ||
      mimeType.includes('javascript');

    let content: string | Buffer;
    let encoding: string | undefined;

    if (isText) {
      const text = await response.text();

      // Convert HTML to plain text
      if (mimeType === 'text/html') {
        content = await this.htmlToText(text);
      } else {
        content = text;
      }
      encoding = 'utf-8';
    } else {
      // Binary content
      content = Buffer.from(await response.arrayBuffer());
    }

    return {
      content,
      mimeType: mimeType === 'text/html' ? 'text/plain' : mimeType,
      filename: this.extractFilenameFromUrl(ref.normalizedUrl, mimeType),
      encoding,
    };
  }

  /**
   * Convert HTML to plain text
   */
  private async htmlToText(html: string): Promise<string> {
    try {
      const { htmlToText } = await import('html-to-text');
      return htmlToText(html, {
        wordwrap: false,
        selectors: [
          { selector: 'a', options: { ignoreHref: true } },
          { selector: 'img', format: 'skip' },
          { selector: 'script', format: 'skip' },
          { selector: 'style', format: 'skip' },
          { selector: 'nav', format: 'skip' },
          { selector: 'footer', format: 'skip' },
          { selector: 'header', format: 'skip' },
        ],
      });
    } catch {
      // Fallback: strip tags manually
      return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
  }

  async checkForUpdates(
    ref: ExternalSourceReference,
    lastSync: Date,
    lastEtag?: string
  ): Promise<UpdateCheckResult> {
    try {
      // Use conditional request headers for efficient checking
      const headers: Record<string, string> = { ...DEFAULT_HEADERS };

      if (lastEtag) {
        headers['If-None-Match'] = lastEtag;
      }

      headers['If-Modified-Since'] = lastSync.toUTCString();

      const response = await fetch(ref.normalizedUrl, {
        method: 'HEAD',
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });

      // 304 Not Modified means no changes
      if (response.status === 304) {
        return { hasUpdates: false };
      }

      if (response.ok) {
        const newEtag = response.headers.get('etag') || undefined;
        const lastModified = response.headers.get('last-modified');
        const newModifiedAt = lastModified ? new Date(lastModified) : undefined;

        // Check if etag changed
        const etagChanged = lastEtag && newEtag && newEtag !== lastEtag;

        // Check if modification time is newer
        const timeChanged = newModifiedAt && newModifiedAt > lastSync;

        return {
          hasUpdates: etagChanged || timeChanged || false,
          newEtag,
          newModifiedAt,
        };
      }

      // If we can't determine, assume no updates
      return { hasUpdates: false };
    } catch (error) {
      this.logger.error('Error checking for updates', error);
      return { hasUpdates: false };
    }
  }

  /**
   * Extract a readable name from a URL
   */
  private extractNameFromUrl(url: string): string {
    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname;

      // Get the last path segment
      const segments = pathname.split('/').filter(Boolean);
      if (segments.length > 0) {
        const lastSegment = segments[segments.length - 1];
        // Decode URL encoding and return
        return decodeURIComponent(lastSegment);
      }

      // Fall back to hostname
      return parsed.hostname;
    } catch {
      return 'Untitled';
    }
  }

  /**
   * Extract or generate a filename from URL
   */
  private extractFilenameFromUrl(url: string, mimeType: string): string {
    const name = this.extractNameFromUrl(url);

    // If name already has an extension, use it
    if (name.includes('.')) {
      return name;
    }

    // Add extension based on MIME type
    const extensions: Record<string, string> = {
      'text/plain': 'txt',
      'text/html': 'txt', // We convert HTML to text
      'application/json': 'json',
      'application/xml': 'xml',
      'text/xml': 'xml',
      'application/pdf': 'pdf',
      'text/markdown': 'md',
      'text/csv': 'csv',
    };

    const ext = extensions[mimeType] || 'txt';
    return `${name}.${ext}`;
  }

  getDefaultSyncPolicy(): SyncPolicy {
    // Default to manual sync for URLs since they may not support
    // efficient change detection
    return 'manual';
  }

  getRateLimitConfig(): RateLimitConfig {
    return {
      requestsPerMinute: 30, // Conservative to avoid blocking
      requestsPerDay: 500,
      backoffOnRateLimit: true,
    };
  }
}
