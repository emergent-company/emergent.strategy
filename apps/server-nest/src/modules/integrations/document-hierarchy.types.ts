/**
 * Generic Document Hierarchy Types
 *
 * These types enable ANY integration to import hierarchical document structures
 * (wikis, repos, folders, pages, etc.) while maintaining parent-child relationships
 * and preserving source-specific metadata.
 *
 * Usage Examples:
 * - ClickUp: Docs → Pages → Sub-pages
 * - GitHub: Repository → Directories → Files
 * - Confluence: Spaces → Pages → Child Pages
 * - Notion: Workspaces → Databases → Pages → Blocks
 * - Google Drive: Folders → Sub-folders → Documents
 *
 * @module integrations/document-hierarchy
 */

/**
 * Internal Document Type
 *
 * Generic representation for mapping external hierarchical data to knowledge base documents.
 * All integrations should map their data structures to this format before storing.
 *
 * The hierarchical relationship is preserved through:
 * - external_parent_id: Points to parent in the source system
 * - parent_document_id: Points to parent in our database (set after storage)
 *
 * @example ClickUp Doc → Page hierarchy
 * ```typescript
 * // Doc (top level)
 * {
 *   external_id: "4bj41-33735",
 *   external_type: "clickup_doc",
 *   external_source: "clickup",
 *   external_parent_id: "90152846670", // Space ID
 *   title: "Technical Glossary",
 *   content: "...",
 *   metadata: { workspace_id: "4573313", ... }
 * }
 *
 * // Page (child)
 * {
 *   external_id: "4bj41-22835",
 *   external_type: "clickup_page",
 *   external_source: "clickup",
 *   external_parent_id: "4bj41-33735", // Doc ID
 *   title: "Introduction",
 *   content: "# Welcome...",
 *   metadata: { parent_page_id: null, ... }
 * }
 * ```
 *
 * @example GitHub Repository → File hierarchy
 * ```typescript
 * // Repository (top level)
 * {
 *   external_id: "repo:123456",
 *   external_type: "github_repository",
 *   external_source: "github",
 *   external_parent_id: "org:eyedea-io",
 *   title: "spec-server",
 *   content: "README.md content...",
 *   metadata: { stars: 42, ... }
 * }
 *
 * // Directory
 * {
 *   external_id: "tree:abc123",
 *   external_type: "github_directory",
 *   external_source: "github",
 *   external_parent_id: "repo:123456",
 *   title: "src/modules",
 *   content: "Directory listing...",
 *   metadata: { path: "src/modules", ... }
 * }
 *
 * // File
 * {
 *   external_id: "blob:def456",
 *   external_type: "github_file",
 *   external_source: "github",
 *   external_parent_id: "tree:abc123",
 *   title: "auth.service.ts",
 *   content: "export class AuthService { ... }",
 *   metadata: { path: "src/modules/auth/auth.service.ts", ... }
 * }
 * ```
 */
export interface InternalDocument {
  /**
   * Unique identifier in the source system
   * @example "4bj41-33735" (ClickUp), "repo:123456" (GitHub), "page-abc" (Confluence)
   */
  external_id: string;

  /**
   * Type of document in the source system
   * Use kebab-case with source prefix: {source}_{type}
   * @example "clickup_doc", "github_file", "confluence_page", "notion_block"
   */
  external_type: string;

  /**
   * Source integration name
   * @example "clickup", "github", "confluence", "notion", "gdrive"
   */
  external_source: string;

  /**
   * Direct link to the object in the source system
   * @example "https://app.clickup.com/4573313/v/dc/4bj41-33735"
   */
  external_url?: string;

  /**
   * Parent object's ID in the source system
   * Used to reconstruct hierarchy during import
   * @example "4bj41-33735" (parent doc ID), "tree:abc123" (parent directory)
   */
  external_parent_id?: string;

  /**
   * Last modified timestamp in the source system
   * Used for incremental sync (only re-import changed docs)
   */
  external_updated_at?: Date;

  /**
   * Document title (human-readable name)
   */
  title: string;

  /**
   * Document content (markdown, plain text, or structured data)
   * Rich content should be converted to markdown where possible
   */
  content: string;

  /**
   * Source-specific metadata (stored in integration_metadata JSONB column)
   *
   * Common metadata fields across integrations:
   * - creator_id: User who created the document
   * - creator_name: Human-readable creator name
   * - created_at: Creation timestamp (ISO string)
   * - updated_at: Last update timestamp (ISO string)
   * - tags: Array of tag strings
   * - labels: Array of label objects
   * - status: Document status (draft, published, archived, etc.)
   * - permissions: Access control metadata
   * - custom_fields: Integration-specific fields
   *
   * ClickUp-specific:
   * - workspace_id, doc_id, page_id, parent_page_id
   * - avatar, cover, presentation_details
   *
   * GitHub-specific:
   * - repository_name, branch, commit_sha
   * - file_path, language, size, encoding
   *
   * Confluence-specific:
   * - space_key, page_id, parent_page_id
   * - version, content_type, restrictions
   */
  metadata: Record<string, any>;

  /**
   * @deprecated Use external_url instead
   */
  url?: string;

  /**
   * Internal parent document ID (set after document is stored)
   * This is NOT part of the mapping - it's set by the storage layer
   * after finding/creating the parent document in our database
   *
   * @internal - Do not set this in mappers, it's managed by storage
   */
  parent_document_id?: string;
}

/**
 * Document Storage Options
 *
 * Options for storing hierarchical documents in the knowledge base
 */
export interface DocumentStorageOptions {
  /**
   * Project ID where document should be stored
   */
  projectId: string;

  /**
   * Organization ID (for multi-tenancy)
   */
  orgId: string;

  /**
   * Integration ID (for tracking source)
   */
  integrationId: string;

  /**
   * Whether to create graph nodes for this document
   * @default true
   */
  createGraphNode?: boolean;

  /**
   * Whether to extract entities from content automatically
   * @default false
   */
  autoExtract?: boolean;

  /**
   * Parent document UUID (if known)
   * If not provided, will be looked up via external_parent_id
   */
  parentDocumentId?: string;
}

/**
 * Document Storage Result
 *
 * Result of storing a document in the knowledge base
 */
export interface DocumentStorageResult {
  /**
   * Internal document UUID
   */
  documentId: string;

  /**
   * Whether document was newly created or updated
   */
  created: boolean;

  /**
   * Graph node ID (if created)
   */
  graphNodeId?: string;
}

/**
 * Hierarchical Import Context
 *
 * Context for tracking hierarchy during recursive imports
 * Pass this through recursive import functions to maintain parent references
 */
export interface HierarchicalImportContext {
  /**
   * Map of external_id → internal document UUID
   * Used to resolve parent_document_id when importing children
   */
  externalIdMap: Map<string, string>;

  /**
   * Current depth in the hierarchy (0 = root)
   * Used for progress tracking and recursion limits
   */
  depth: number;

  /**
   * Maximum depth to import (prevents infinite recursion)
   * @default 10
   */
  maxDepth?: number;
}
