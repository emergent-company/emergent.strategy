/**
 * Tool definitions with metadata for the chat SDK.
 * Used by both the backend (tool filtering) and frontend (UI display).
 */

export interface ToolDefinition {
  name: string;
  description: string;
  icon: string;
  group: string;
  groupLabel: string;
  groupIcon: string;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  // Knowledge Base Tools
  {
    name: 'search_knowledge_base',
    description: 'Search documents and knowledge graph',
    icon: 'lucide--search',
    group: 'knowledge-base',
    groupLabel: 'Knowledge Base',
    groupIcon: 'lucide--database',
  },
  {
    name: 'query_graph_objects',
    description: 'Query objects with filters',
    icon: 'lucide--filter',
    group: 'knowledge-base',
    groupLabel: 'Knowledge Base',
    groupIcon: 'lucide--database',
  },
  {
    name: 'get_database_schema',
    description: 'Inspect schema definitions',
    icon: 'lucide--table',
    group: 'knowledge-base',
    groupLabel: 'Knowledge Base',
    groupIcon: 'lucide--database',
  },
  // Web Tools
  {
    name: 'search_web',
    description: 'Search the internet (DuckDuckGo)',
    icon: 'lucide--globe',
    group: 'web',
    groupLabel: 'Web',
    groupIcon: 'lucide--globe',
  },
  {
    name: 'browse_url',
    description: 'Read and extract content from a web page',
    icon: 'lucide--file-text',
    group: 'web',
    groupLabel: 'Web',
    groupIcon: 'lucide--globe',
  },
  {
    name: 'import_document',
    description:
      'Import documents from external URLs (Google Drive, web pages)',
    icon: 'lucide--download',
    group: 'knowledge-base',
    groupLabel: 'Knowledge Base',
    groupIcon: 'lucide--database',
  },
];

/** Get all tool names */
export const ALL_TOOL_NAMES = TOOL_DEFINITIONS.map((t) => t.name);

/** Get unique groups with their labels */
export const TOOL_GROUPS = [
  ...new Map(
    TOOL_DEFINITIONS.map((t) => [
      t.group,
      { group: t.group, label: t.groupLabel, icon: t.groupIcon },
    ])
  ).values(),
];
