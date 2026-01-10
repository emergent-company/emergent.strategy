/**
 * Source Type Plugin System
 *
 * This module provides a plugin architecture for document source types.
 * Each plugin defines how documents of that source type should be displayed
 * in the UI (icon, label, table columns, etc.)
 */

import type { ColumnDef } from '@/components/organisms/DataTable';
import { Icon } from '@/components/atoms/Icon';

// Document type for column accessors
interface DocumentRow {
  id: string;
  name: string;
  sourceUrl?: string | null;
  mimeType?: string | null;
  createdAt: string;
  updatedAt: string;
  integrationMetadata?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  chunks: number;
  totalChars?: number;
  embeddedChunks?: number;
  conversionStatus?: string;
  fileSizeBytes?: number | null;
  sourceType?: string | null;
  parentDocumentId?: string | null;
  childCount?: number | null;
}

/**
 * Configuration for a source type plugin.
 */
export interface SourceTypePlugin {
  /** Unique identifier matching the `source_type` field on documents */
  sourceType: string;
  /** Display name shown in sidebar and page headers */
  displayName: string;
  /** Plural display name for lists */
  displayNamePlural: string;
  /** Iconify icon name (e.g., 'lucide--mail') */
  icon: string;
  /** Optional description for the source type */
  description?: string;
  /** Priority for ordering in sidebar (lower = higher) */
  priority: number;
  /**
   * Custom column definitions for the documents table.
   * If not provided, default document columns are used.
   */
  tableColumns?: ColumnDef<DocumentRow>[];
  /**
   * Fields to extract from integrationMetadata for display.
   * Keys are metadata field names, values are display labels.
   */
  metadataFields?: Record<string, string>;
}

/**
 * Registry of source type plugins.
 * Maps source_type string to plugin configuration.
 */
const pluginRegistry = new Map<string, SourceTypePlugin>();

/**
 * Register a source type plugin.
 */
export function registerSourceTypePlugin(plugin: SourceTypePlugin): void {
  pluginRegistry.set(plugin.sourceType, plugin);
}

/**
 * Get a source type plugin by type.
 * Returns undefined if not found.
 */
export function getSourceTypePlugin(
  sourceType: string
): SourceTypePlugin | undefined {
  return pluginRegistry.get(sourceType);
}

/**
 * Get all registered source type plugins.
 * Returns plugins sorted by priority.
 */
export function getAllSourceTypePlugins(): SourceTypePlugin[] {
  return Array.from(pluginRegistry.values()).sort(
    (a, b) => a.priority - b.priority
  );
}

/**
 * Check if a source type has a registered plugin.
 */
export function hasSourceTypePlugin(sourceType: string): boolean {
  return pluginRegistry.has(sourceType);
}

// ============================================================================
// Built-in Plugins
// ============================================================================

/**
 * Upload source type - manually uploaded documents.
 */
export const uploadPlugin: SourceTypePlugin = {
  sourceType: 'upload',
  displayName: 'Document',
  displayNamePlural: 'Documents',
  icon: 'lucide--file-text',
  description: 'Manually uploaded documents',
  priority: 0,
  tableColumns: [
    {
      key: 'name',
      label: 'Name',
    },
    {
      key: 'mimeType',
      label: 'Type',
    },
    {
      key: 'fileSizeBytes',
      label: 'Size',
    },
    {
      key: 'conversionStatus',
      label: 'Status',
    },
    {
      key: 'chunks',
      label: 'Chunks',
    },
    {
      key: 'createdAt',
      label: 'Uploaded',
    },
  ],
};

/**
 * Google Drive source type - files synced from Google Drive.
 */
export const drivePlugin: SourceTypePlugin = {
  sourceType: 'drive',
  displayName: 'Google Drive',
  displayNamePlural: 'Google Drive Files',
  icon: 'logos--google-drive',
  description: 'Files synced from Google Drive',
  priority: 5,
  metadataFields: {
    mimeType: 'Type',
    modifiedTime: 'Modified',
    owners: 'Owner',
    webViewLink: 'Drive Link',
  },
  tableColumns: [
    {
      key: 'name',
      label: 'Name',
    },
    {
      key: 'driveType',
      label: 'Type',
      render: (row: DocumentRow) =>
        (row.metadata?.mimeType as string) || row.mimeType || '-',
    },
    {
      key: 'childCount',
      label: 'Files',
    },
    {
      key: 'chunks',
      label: 'Chunks',
    },
    {
      key: 'modifiedTime',
      label: 'Modified',
      render: (row: DocumentRow) =>
        (row.metadata?.driveModifiedTime as string) || row.updatedAt,
    },
    {
      key: 'driveLink',
      label: 'Drive',
      render: (row: DocumentRow) => {
        const link = row.metadata?.webViewLink as string;
        if (!link) return '-';
        return (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-xs"
            title="Open in Google Drive"
            onClick={(e) => e.stopPropagation()}
          >
            <Icon icon="lucide--external-link" className="w-4 h-4" />
          </a>
        );
      },
    },
  ],
};

/**
 * Email source type - documents from email integrations.
 */
export const emailPlugin: SourceTypePlugin = {
  sourceType: 'email',
  displayName: 'Email',
  displayNamePlural: 'Emails',
  icon: 'lucide--mail',
  description: 'Emails from connected mail servers',
  priority: 10,
  metadataFields: {
    from: 'From',
    to: 'To',
    subject: 'Subject',
    date: 'Date',
    messageId: 'Message ID',
  },
  tableColumns: [
    {
      key: 'subject',
      label: 'Subject',
      render: (row: DocumentRow) =>
        (row.integrationMetadata?.subject as string) || row.name,
    },
    {
      key: 'from',
      label: 'From',
      render: (row: DocumentRow) =>
        (row.integrationMetadata?.from as string) || '-',
    },
    {
      key: 'childCount',
      label: 'Attachments',
    },
    {
      key: 'chunks',
      label: 'Chunks',
    },
    {
      key: 'date',
      label: 'Date',
      render: (row: DocumentRow) =>
        (row.integrationMetadata?.date as string) || row.createdAt,
    },
  ],
};

/**
 * Email Attachment source type - files attached to emails.
 */
export const emailAttachmentPlugin: SourceTypePlugin = {
  sourceType: 'email_attachment',
  displayName: 'Email Attachment',
  displayNamePlural: 'Email Attachments',
  icon: 'lucide--paperclip',
  description: 'Files attached to imported emails',
  priority: 11, // Right after email (10)
  tableColumns: [
    {
      key: 'name',
      label: 'Filename',
    },
    {
      key: 'mimeType',
      label: 'Type',
    },
    {
      key: 'chunks',
      label: 'Chunks',
    },
    {
      key: 'createdAt',
      label: 'Created',
    },
  ],
};

/**
 * URL source type - documents imported from URLs.
 */
export const urlPlugin: SourceTypePlugin = {
  sourceType: 'url',
  displayName: 'Web Page',
  displayNamePlural: 'Web Pages',
  icon: 'lucide--globe',
  description: 'Documents imported from URLs',
  priority: 20,
  tableColumns: [
    {
      key: 'name',
      label: 'Title',
    },
    {
      key: 'sourceUrl',
      label: 'URL',
    },
    {
      key: 'chunks',
      label: 'Chunks',
    },
    {
      key: 'createdAt',
      label: 'Imported',
    },
  ],
};

/**
 * External source type - documents from external integrations (ClickUp, Jira, etc.)
 */
export const externalPlugin: SourceTypePlugin = {
  sourceType: 'external',
  displayName: 'External',
  displayNamePlural: 'External Documents',
  icon: 'lucide--link',
  description: 'Documents from external integrations',
  priority: 30,
  tableColumns: [
    {
      key: 'name',
      label: 'Name',
    },
    {
      key: 'sourceUrl',
      label: 'Source',
    },
    {
      key: 'chunks',
      label: 'Chunks',
    },
    {
      key: 'createdAt',
      label: 'Synced',
    },
  ],
};

// Register built-in plugins
registerSourceTypePlugin(uploadPlugin);
registerSourceTypePlugin(drivePlugin);
registerSourceTypePlugin(emailPlugin);
registerSourceTypePlugin(emailAttachmentPlugin);
registerSourceTypePlugin(urlPlugin);
registerSourceTypePlugin(externalPlugin);

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get the icon for a source type.
 * Falls back to a default icon if plugin not found.
 */
export function getSourceTypeIcon(
  sourceType: string | null | undefined
): string {
  if (!sourceType) return 'lucide--file-text';
  const plugin = getSourceTypePlugin(sourceType);
  return plugin?.icon ?? 'lucide--file-question';
}

/**
 * Get the display name for a source type.
 * Falls back to the source type string if plugin not found.
 */
export function getSourceTypeDisplayName(
  sourceType: string | null | undefined,
  plural = false
): string {
  if (!sourceType) return plural ? 'Documents' : 'Document';
  const plugin = getSourceTypePlugin(sourceType);
  if (plugin) {
    return plural ? plugin.displayNamePlural : plugin.displayName;
  }
  // Fallback: capitalize the source type
  return sourceType.charAt(0).toUpperCase() + sourceType.slice(1);
}

/**
 * Get default columns for the "All Sources" view.
 * These columns work across all document types.
 */
export function getDefaultTableColumns(): ColumnDef<DocumentRow>[] {
  return [
    {
      key: 'name',
      label: 'Name',
    },
    {
      key: 'sourceType',
      label: 'Source',
    },
    {
      key: 'childCount',
      label: 'Children',
    },
    {
      key: 'conversionStatus',
      label: 'Status',
    },
    {
      key: 'chunks',
      label: 'Chunks',
    },
    {
      key: 'createdAt',
      label: 'Created',
    },
  ];
}
