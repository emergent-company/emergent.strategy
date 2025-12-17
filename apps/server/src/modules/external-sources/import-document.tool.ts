import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { ExternalSourcesService } from './external-sources.service';
import { ExternalSourceProviderRegistry } from './external-source-provider-registry.service';

/**
 * Result DTO for import_document tool
 */
interface ImportDocumentResult {
  success: boolean;
  data?: {
    externalSourceId?: string;
    documentId?: string;
    status: 'created' | 'duplicate' | 'updated' | 'queued' | 'error';
    providerType?: string;
    displayName?: string;
    message?: string;
  };
  error?: string;
}

/**
 * ImportDocumentTool
 *
 * MCP tool that allows AI agents to import documents from external URLs
 * (Google Drive, Dropbox, web pages, etc.) into the knowledge base.
 *
 * This tool is designed to be used in chat conversations when users share
 * links to external documents they want to analyze or query.
 *
 * Features:
 * - Automatic provider detection (Google Drive, Dropbox, generic URL)
 * - Access validation before import
 * - Deduplication (returns existing document if already imported)
 * - Immediate import with content fetching
 * - Returns document ID for follow-up queries
 *
 * @example
 * Agent: User shared a Google Drive link. Let me import that document.
 * Tool call: import_document({ url: 'https://drive.google.com/file/d/abc123/view' })
 * Result: { success: true, data: { documentId: '...', status: 'created', displayName: 'Q4 Report.pdf' }}
 * Agent: I've imported 'Q4 Report.pdf'. What would you like to know about it?
 */
@Injectable()
export class ImportDocumentTool {
  constructor(
    private readonly externalSourcesService: ExternalSourcesService,
    private readonly providerRegistry: ExternalSourceProviderRegistry
  ) {}

  /**
   * Import a document from an external URL
   *
   * The tool will:
   * 1. Detect which provider can handle the URL (Google Drive, Dropbox, generic URL)
   * 2. Validate access to the resource
   * 3. Check for existing imports (deduplication)
   * 4. Fetch content and create a document in the knowledge base
   * 5. Return the document ID for immediate use in queries
   *
   * @param url - The external URL to import from
   * @param projectId - Target project (from context)
   * @returns Import result with document ID and status
   */
  @Tool({
    name: 'import_document',
    description: `Import a document from an external URL into the knowledge base.
    
Supports:
- Google Drive files (docs, sheets, PDFs, etc.)
- Dropbox files (public links)
- Web pages (any public URL)

The document will be immediately available for queries after import.

Returns:
- documentId: ID of the created/existing document
- status: 'created', 'duplicate', 'updated', or 'error'
- displayName: Name of the imported document

Use this when:
- User shares a link to a document they want to analyze
- User mentions a Google Drive file or Dropbox link
- User wants to import a web article for reference`,
    parameters: z.object({
      url: z
        .string()
        .url()
        .describe('The URL of the external document to import'),
      syncPolicy: z
        .enum(['manual', 'on_access', 'periodic'])
        .optional()
        .describe(
          'How often to sync updates (default: manual). Use "periodic" for frequently updated sources.'
        ),
    }),
  })
  async import_document(
    params: {
      url: string;
      syncPolicy?: 'manual' | 'on_access' | 'periodic';
    },
    context?: { projectId?: string }
  ): Promise<ImportDocumentResult> {
    // Validate project context
    const projectId = context?.projectId;
    if (!projectId) {
      return {
        success: false,
        error:
          'Project context is required. Ensure the chat session has a project selected.',
      };
    }

    try {
      // 1. Check if any provider can handle this URL
      const provider = this.providerRegistry.detectProvider(params.url);
      if (!provider) {
        return {
          success: false,
          data: {
            status: 'error',
            message: `No provider found that can handle this URL. Supported: Google Drive, Dropbox, generic URLs.`,
          },
          error: 'Unsupported URL type',
        };
      }

      // 2. Parse the URL to get reference details
      const ref = provider.parseUrl(params.url);
      if (!ref) {
        return {
          success: false,
          data: {
            status: 'error',
            providerType: provider.providerType,
            message: `Failed to parse URL for ${provider.displayName}. The URL format may be invalid.`,
          },
          error: 'Invalid URL format',
        };
      }

      // 3. Check access before attempting import
      const accessCheck = await provider.checkAccess(ref);
      if (!accessCheck.accessible) {
        const reasonMessages: Record<string, string> = {
          not_found: 'The file was not found. It may have been deleted.',
          permission_denied:
            'Access denied. The file may not be shared publicly.',
          rate_limited: 'Rate limited by the provider. Please try again later.',
          unsupported_type: 'This file type is not supported for import.',
        };

        return {
          success: false,
          data: {
            status: 'error',
            providerType: provider.providerType,
            message:
              reasonMessages[accessCheck.reason || ''] ||
              `Cannot access the file: ${accessCheck.reason}`,
          },
          error: `Access check failed: ${accessCheck.reason}`,
        };
      }

      // 4. Import the document
      const result = await this.externalSourcesService.importFromUrl(
        {
          url: params.url,
          syncPolicy: params.syncPolicy,
          immediate: true, // Always import immediately for chat
        },
        projectId
      );

      // 5. Build response based on result
      if (result.success) {
        const statusMessages: Record<string, string> = {
          created: `Successfully imported document from ${provider.displayName}.`,
          duplicate: `This document was already imported. Using existing version.`,
          updated: `Document updated with latest content from ${provider.displayName}.`,
          queued: `Document import queued for background processing.`,
        };

        return {
          success: true,
          data: {
            externalSourceId: result.externalSourceId,
            documentId: result.documentId,
            status: result.status,
            providerType: provider.providerType,
            displayName:
              accessCheck.metadata?.name ||
              this.extractNameFromUrl(params.url) ||
              'Imported Document',
            message: statusMessages[result.status] || 'Import completed.',
          },
        };
      }

      // Import failed
      return {
        success: false,
        data: {
          externalSourceId: result.externalSourceId,
          status: 'error',
          providerType: provider.providerType,
          message: result.error || 'Failed to import document.',
        },
        error: result.error,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error during import',
      };
    }
  }

  /**
   * Extract a reasonable name from URL as fallback
   */
  private extractNameFromUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);
      // Try to get filename from path
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      const lastPart = pathParts[pathParts.length - 1];

      if (lastPart && !lastPart.includes('?')) {
        // Decode and clean up
        const decoded = decodeURIComponent(lastPart);
        // Remove common ID patterns
        if (
          decoded.length > 30 &&
          /^[a-zA-Z0-9_-]+$/.test(decoded) &&
          !decoded.includes('.')
        ) {
          return null; // Likely an ID, not a name
        }
        return decoded;
      }
      return null;
    } catch {
      return null;
    }
  }
}
