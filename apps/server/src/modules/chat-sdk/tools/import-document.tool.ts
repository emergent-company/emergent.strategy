import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { ExternalSourcesService } from '../../external-sources/external-sources.service';
import { ExternalSourceProviderRegistry } from '../../external-sources/external-source-provider-registry.service';

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
    /** Hint for the AI on what to do next */
    nextAction?: string;
  };
  error?: string;
  userMessage?: string;
}

/**
 * Extract a reasonable name from URL as fallback
 */
function extractNameFromUrl(url: string): string | null {
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

/**
 * Create a LangChain tool for importing documents from external URLs
 *
 * This tool allows the AI to import documents from external sources like
 * Google Drive, Dropbox, or generic web URLs into the knowledge base.
 *
 * Features:
 * - Automatic provider detection (Google Drive, Dropbox, generic URL)
 * - Access validation before import
 * - Deduplication (returns existing document if already imported)
 * - Immediate import with content fetching
 * - Returns document ID for follow-up queries
 *
 * @param externalSourcesService - Service for importing documents
 * @param providerRegistry - Registry for detecting and handling different source types
 * @param context - Context with projectId for the import
 * @returns LangChain DynamicStructuredTool configured for document import
 */
export function createImportDocumentTool(
  externalSourcesService: ExternalSourcesService,
  providerRegistry: ExternalSourceProviderRegistry,
  context: { projectId: string }
) {
  return new DynamicStructuredTool({
    name: 'import_document',
    description: `Import a document from an external URL into the knowledge base for analysis and querying.

Supports:
- Google Drive files (docs, sheets, PDFs, etc.) - public or shared links
- Web pages (any public URL) - articles, documentation, etc.

The document will be immediately available for queries after import.

Use this when:
- User shares a Google Drive link they want to analyze
- User pastes a URL to a document or web page for reference
- User asks to "read", "import", or "analyze" content from a link
- User says "check this out" or "look at this" with a URL

DO NOT use this for:
- Simple web browsing (use browse_url instead for quick reads without import)
- URLs that require authentication (only public/shared links work)
- Searching the web (use search_web instead)

After successful import, the document content becomes part of the knowledge base and can be searched with search_knowledge_base.

IMPORTANT - Error Handling:
When this tool returns an error, explain the error to the user in plain language using the "userMessage" field. Common errors:
- No provider found: The URL type isn't supported
- Access denied: The file isn't shared publicly
- Not found: The file was deleted or moved`,

    schema: z.object({
      url: z
        .string()
        .describe(
          'The URL of the external document to import (Google Drive link, web page URL, etc.)'
        ),
      syncPolicy: z
        .enum(['manual', 'periodic'])
        .optional()
        .describe(
          'How often to sync updates. Use "periodic" for frequently updated sources, "manual" (default) for static documents.'
        ),
    }) as any,

    func: async (input: any): Promise<string> => {
      const { url, syncPolicy } = input;
      const { projectId } = context;

      // Validate project context
      if (!projectId) {
        const result: ImportDocumentResult = {
          success: false,
          error: 'Project context is required',
          userMessage:
            'I cannot import documents without a project context. Please make sure you have a project selected.',
        };
        return JSON.stringify(result, null, 2);
      }

      try {
        // 1. Check if any provider can handle this URL
        const provider = providerRegistry.detectProvider(url);
        if (!provider) {
          const result: ImportDocumentResult = {
            success: false,
            data: {
              status: 'error',
              message:
                'No provider found that can handle this URL. Supported: Google Drive, generic URLs.',
            },
            error: 'Unsupported URL type',
            userMessage:
              "I don't recognize this URL format. I can import documents from Google Drive (shared links) or regular web pages. Could you check the URL and try again?",
          };
          return JSON.stringify(result, null, 2);
        }

        // 2. Parse the URL to get reference details
        const ref = provider.parseUrl(url);
        if (!ref) {
          const result: ImportDocumentResult = {
            success: false,
            data: {
              status: 'error',
              providerType: provider.providerType,
              message: `Failed to parse URL for ${provider.displayName}. The URL format may be invalid.`,
            },
            error: 'Invalid URL format',
            userMessage: `The URL format doesn't look right for ${provider.displayName}. Could you double-check it and share the correct link?`,
          };
          return JSON.stringify(result, null, 2);
        }

        // 3. Check access before attempting import
        const accessCheck = await provider.checkAccess(ref);
        if (!accessCheck.accessible) {
          const reasonMessages: Record<string, string> = {
            not_found:
              "I couldn't find this file. It may have been deleted or moved. Could you verify the link is still valid?",
            permission_denied:
              "I don't have access to this file. It might not be shared publicly. In Google Drive, you can make it accessible by clicking 'Share' and choosing 'Anyone with the link'.",
            rate_limited:
              'The service is limiting requests right now. Please try again in a few minutes.',
            unsupported_type:
              "This file type isn't supported for import. I can import documents, spreadsheets, PDFs, and web pages.",
          };

          const result: ImportDocumentResult = {
            success: false,
            data: {
              status: 'error',
              providerType: provider.providerType,
              message: `Cannot access the file: ${accessCheck.reason}`,
            },
            error: `Access check failed: ${accessCheck.reason}`,
            userMessage:
              reasonMessages[accessCheck.reason || ''] ||
              `I couldn't access this file: ${accessCheck.reason}. Please check that the link is correct and publicly accessible.`,
          };
          return JSON.stringify(result, null, 2);
        }

        // 4. Import the document
        const importResult = await externalSourcesService.importFromUrl(
          {
            url,
            syncPolicy: syncPolicy || 'manual',
            immediate: true, // Always import immediately for chat
          },
          projectId
        );

        // 5. Build response based on result
        if (importResult.success) {
          const statusMessages: Record<string, string> = {
            created: `Successfully imported "${
              accessCheck.metadata?.name || 'document'
            }" from ${
              provider.displayName
            }. The content is now in the knowledge base.`,
            duplicate:
              'This document was already in your knowledge base. Using the existing version.',
            updated: `Updated the document with the latest content from ${provider.displayName}.`,
            queued:
              'The document is being imported in the background. It should be ready shortly.',
          };

          const displayName =
            accessCheck.metadata?.name ||
            extractNameFromUrl(url) ||
            'Imported Document';

          const result: ImportDocumentResult = {
            success: true,
            data: {
              externalSourceId: importResult.externalSourceId,
              documentId: importResult.documentId,
              status: importResult.status,
              providerType: provider.providerType,
              displayName,
              message:
                statusMessages[importResult.status] || 'Import completed.',
              nextAction: `IMPORTANT: Now use search_knowledge_base with the document name "${displayName}" or key terms to retrieve and summarize its content for the user. The user expects to see what's in the document.`,
            },
          };
          return JSON.stringify(result, null, 2);
        }

        // Import failed
        const result: ImportDocumentResult = {
          success: false,
          data: {
            externalSourceId: importResult.externalSourceId,
            status: 'error',
            providerType: provider.providerType,
            message: importResult.error || 'Failed to import document.',
          },
          error: importResult.error,
          userMessage: `I had trouble importing this document: ${
            importResult.error || 'Unknown error'
          }. You might want to try again or share a different link.`,
        };
        return JSON.stringify(result, null, 2);
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Unknown error during import';

        const result: ImportDocumentResult = {
          success: false,
          error: errorMessage,
          userMessage: `Something went wrong while importing the document: ${errorMessage}. Please try again.`,
        };
        return JSON.stringify(result, null, 2);
      }
    },
  });
}
