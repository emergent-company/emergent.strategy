/**
 * ToolCallIndicator - Shows when the chat agent is executing a tool
 *
 * Displays a small, dimmed indicator showing the tool name and status.
 * This helps users understand what the AI is doing behind the scenes.
 */

import { memo } from 'react';
import { Spinner } from '@/components/atoms/Spinner';

export interface ToolCallInfo {
  toolName: string;
  toolCallId: string;
  state: 'partial-call' | 'call' | 'result';
  args?: unknown;
  result?: unknown;
}

interface ToolCallIndicatorProps {
  toolCall: ToolCallInfo;
}

/**
 * Get a human-readable label for a tool name
 */
function getToolLabel(toolName: string): string {
  const labels: Record<string, string> = {
    search_knowledge_base: 'Searching knowledge base',
    query_graph_objects: 'Querying objects',
    get_database_schema: 'Getting schema',
    search_web: 'Searching the web',
  };
  return labels[toolName] || `Using ${toolName}`;
}

/**
 * Get an icon for a tool name
 */
function getToolIcon(toolName: string): string {
  const icons: Record<string, string> = {
    search_knowledge_base: 'lucide--search',
    query_graph_objects: 'lucide--database',
    get_database_schema: 'lucide--table',
    search_web: 'lucide--globe',
  };
  return icons[toolName] || 'lucide--wrench';
}

export const ToolCallIndicator = memo(function ToolCallIndicator({
  toolCall,
}: ToolCallIndicatorProps) {
  const { toolName, state } = toolCall;
  const label = getToolLabel(toolName);
  const icon = getToolIcon(toolName);

  const isLoading = state === 'partial-call' || state === 'call';
  const isComplete = state === 'result';

  return (
    <div className="flex items-center gap-2 text-xs text-base-content/50 py-1">
      <span className={`iconify ${icon} size-3.5`} />
      <span>{label}</span>
      {isLoading && <Spinner size="xs" />}
      {isComplete && (
        <span className="iconify lucide--check size-3.5 text-success" />
      )}
    </div>
  );
});

/**
 * ToolCallList - Renders a list of tool calls
 */
interface ToolCallListProps {
  toolCalls: ToolCallInfo[];
}

export const ToolCallList = memo(function ToolCallList({
  toolCalls,
}: ToolCallListProps) {
  if (toolCalls.length === 0) return null;

  return (
    <div className="border-l-2 border-base-300 pl-3 my-2 space-y-0.5">
      {toolCalls.map((toolCall) => (
        <ToolCallIndicator key={toolCall.toolCallId} toolCall={toolCall} />
      ))}
    </div>
  );
});
