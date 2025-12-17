import { Injectable } from '@nestjs/common';
import { ExternalSourceProviderRegistry } from './external-source-provider-registry.service';
import { ExternalSourceReference } from './interfaces';

/**
 * Detected link from a message
 */
export interface DetectedLink {
  /** Original URL as found in message */
  url: string;
  /** Provider type that can handle this URL */
  provider: string;
  /** Provider's display name */
  providerDisplayName: string;
  /** Parsed reference details */
  reference: ExternalSourceReference;
  /** Position in the original message */
  position: {
    start: number;
    end: number;
  };
}

/**
 * ExternalLinkDetector Service
 *
 * Detects external source links in chat messages and other text content.
 * Uses the provider registry to identify which links can be imported.
 *
 * Features:
 * - Extracts all URLs from text
 * - Identifies which URLs are importable via known providers
 * - Returns parsed references ready for import
 *
 * @example
 * ```typescript
 * const message = "Check out this doc: https://drive.google.com/file/d/abc123/view";
 * const links = linkDetector.detectLinks(message);
 * // [{ url: '...', provider: 'google_drive', reference: {...} }]
 * ```
 */
@Injectable()
export class ExternalLinkDetector {
  // URL regex that captures most valid URLs
  // Excludes common punctuation at the end that might not be part of the URL
  private readonly urlRegex =
    /https?:\/\/[^\s<>"{}|\\^`\[\]()]+(?:\([^\s<>"{}|\\^`\[\]()]*\))?[^\s<>"{}|\\^`\[\]().,;:!?'")\]]*[^\s<>"{}|\\^`\[\]().,;:!?'")\]]/gi;

  constructor(
    private readonly providerRegistry: ExternalSourceProviderRegistry
  ) {}

  /**
   * Detect all importable external links in a message
   *
   * @param message - Text content to scan for links
   * @returns Array of detected links with provider and reference info
   */
  detectLinks(message: string): DetectedLink[] {
    const links: DetectedLink[] = [];
    const seen = new Set<string>(); // Avoid duplicates

    // Reset regex state
    this.urlRegex.lastIndex = 0;

    let match;
    while ((match = this.urlRegex.exec(message)) !== null) {
      const url = this.cleanUrl(match[0]);

      // Skip if we've already seen this URL
      if (seen.has(url)) {
        continue;
      }
      seen.add(url);

      // Try to find a provider that can handle this URL
      const provider = this.providerRegistry.detectProvider(url);
      if (provider) {
        const reference = provider.parseUrl(url);
        if (reference) {
          links.push({
            url,
            provider: provider.providerType,
            providerDisplayName: provider.displayName,
            reference,
            position: {
              start: match.index,
              end: match.index + match[0].length,
            },
          });
        }
      }
    }

    return links;
  }

  /**
   * Detect first importable link in a message
   *
   * Convenience method when only the first link is needed.
   *
   * @param message - Text content to scan
   * @returns First detected link or null if none found
   */
  detectFirstLink(message: string): DetectedLink | null {
    // For efficiency, we could implement early-exit logic,
    // but for now we just use detectLinks
    const links = this.detectLinks(message);
    return links.length > 0 ? links[0] : null;
  }

  /**
   * Check if a message contains any importable links
   *
   * @param message - Text content to scan
   * @returns True if at least one importable link is found
   */
  hasImportableLinks(message: string): boolean {
    return this.detectLinks(message).length > 0;
  }

  /**
   * Get all URLs from a message (including non-importable ones)
   *
   * @param message - Text content to scan
   * @returns Array of all URLs found
   */
  extractAllUrls(message: string): string[] {
    const urls: string[] = [];
    const seen = new Set<string>();

    this.urlRegex.lastIndex = 0;

    let match;
    while ((match = this.urlRegex.exec(message)) !== null) {
      const url = this.cleanUrl(match[0]);
      if (!seen.has(url)) {
        seen.add(url);
        urls.push(url);
      }
    }

    return urls;
  }

  /**
   * Clean URL by removing trailing punctuation that might have been captured
   */
  private cleanUrl(url: string): string {
    // Remove trailing punctuation that's likely not part of the URL
    return url.replace(/[.,;:!?'")\]]+$/, '');
  }

  /**
   * Get a summary of detected links for display
   *
   * @param links - Array of detected links
   * @returns Human-readable summary
   */
  summarizeLinks(links: DetectedLink[]): string {
    if (links.length === 0) {
      return 'No importable links detected.';
    }

    if (links.length === 1) {
      const link = links[0];
      return `Found 1 ${link.providerDisplayName} link that can be imported.`;
    }

    // Group by provider
    const byProvider = links.reduce((acc, link) => {
      const key = link.providerDisplayName;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const parts = Object.entries(byProvider).map(
      ([provider, count]) => `${count} ${provider}`
    );

    return `Found ${links.length} importable links: ${parts.join(', ')}.`;
  }
}
