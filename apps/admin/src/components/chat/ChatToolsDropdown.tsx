/**
 * ChatToolsDropdown - Displays available tools with enable/disable checkboxes
 *
 * Shows a small icon that expands to reveal all tools the chat agent can use.
 * Tools are grouped visually (Knowledge Base, Web) and each tool has a checkbox
 * to enable/disable it for the current conversation.
 * Uses a portal to escape overflow constraints from parent containers.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface ToolDefinition {
  name: string;
  description: string;
  icon: string;
  group: string;
  groupLabel: string;
  groupIcon: string;
}

export interface ChatToolsDropdownProps {
  /** All available tools from the API */
  tools: ToolDefinition[];
  /** Currently enabled tool names (null = all enabled) */
  enabledTools: string[] | null;
  /** Called when a tool is toggled */
  onToolToggle: (toolName: string, enabled: boolean) => void;
}

/**
 * Group tools by their group property
 */
function groupTools(
  tools: ToolDefinition[]
): Map<string, { label: string; icon: string; tools: ToolDefinition[] }> {
  const groups = new Map<
    string,
    { label: string; icon: string; tools: ToolDefinition[] }
  >();

  for (const tool of tools) {
    if (!groups.has(tool.group)) {
      groups.set(tool.group, {
        label: tool.groupLabel,
        icon: tool.groupIcon,
        tools: [],
      });
    }
    groups.get(tool.group)!.tools.push(tool);
  }

  return groups;
}

export function ChatToolsDropdown({
  tools,
  enabledTools,
  onToolToggle,
}: ChatToolsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Calculate which tools are enabled
  // null means all tools are enabled
  const allToolNames = tools.map((t) => t.name);
  const effectiveEnabledTools = enabledTools ?? allToolNames;

  const enabledCount = effectiveEnabledTools.filter((t) =>
    allToolNames.includes(t)
  ).length;
  const totalCount = tools.length;
  // All enabled if: null (default), or all tools in the list are enabled
  // Also consider all enabled if tools haven't loaded yet (totalCount === 0)
  const allEnabled =
    totalCount === 0 || enabledTools === null || enabledCount === totalCount;
  const noneEnabled = totalCount > 0 && enabledCount === 0;

  // Group tools for display
  const groupedTools = groupTools(tools);

  // Update position when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      // Position above the button, centered horizontally
      setPosition({
        top: rect.top - 8, // 8px gap above button
        left: rect.left + rect.width / 2,
      });
    }
  }, [isOpen]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  if (tools.length === 0) {
    return null;
  }

  const isToolEnabled = (toolName: string) =>
    effectiveEnabledTools.includes(toolName);

  const handleCheckboxChange = (toolName: string, checked: boolean) => {
    onToolToggle(toolName, checked);
  };

  const dropdown = isOpen
    ? createPortal(
        <div
          ref={dropdownRef}
          className="fixed bg-base-200 rounded-lg shadow-xl border border-base-300 p-3 w-80 z-50"
          style={{
            top: position.top,
            left: position.left,
            transform: 'translate(-50%, -100%)',
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-base-300">
            <span className="iconify lucide--sparkles size-4 text-primary" />
            <span className="text-sm font-medium">Chat Tools</span>
            <span className="badge badge-sm badge-ghost ml-auto">
              {enabledCount}/{totalCount}
            </span>
          </div>

          {/* Warning when all tools disabled */}
          {noneEnabled && (
            <div className="mb-3 p-2 bg-warning/10 border border-warning/30 rounded-md">
              <div className="flex items-start gap-2">
                <span className="iconify lucide--alert-triangle size-4 text-warning mt-0.5 shrink-0" />
                <p className="text-xs text-warning">
                  No tools enabled - the assistant won't be able to access
                  database data or perform searches
                </p>
              </div>
            </div>
          )}

          {/* Tool Groups */}
          <div className="space-y-4">
            {Array.from(groupedTools.entries()).map(
              ([groupId, { label, icon, tools: groupTools }]) => (
                <div key={groupId}>
                  {/* Group Header */}
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`iconify ${icon} size-4 text-base-content/60`}
                    />
                    <span className="text-xs font-semibold text-base-content/70 uppercase tracking-wide">
                      {label}
                    </span>
                  </div>

                  {/* Group Tools */}
                  <ul className="space-y-1">
                    {groupTools.map((tool) => {
                      const enabled = isToolEnabled(tool.name);
                      return (
                        <li key={tool.name}>
                          <label className="flex items-start gap-3 p-2 rounded-md hover:bg-base-300/50 transition-colors cursor-pointer">
                            <input
                              type="checkbox"
                              className="checkbox checkbox-sm checkbox-primary mt-0.5"
                              checked={enabled}
                              onChange={(e) =>
                                handleCheckboxChange(
                                  tool.name,
                                  e.target.checked
                                )
                              }
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`iconify ${tool.icon} size-4 ${
                                    enabled
                                      ? 'text-base-content/70'
                                      : 'text-base-content/40'
                                  }`}
                                />
                                <span
                                  className={`text-sm font-medium ${
                                    enabled ? '' : 'text-base-content/50'
                                  }`}
                                >
                                  {tool.name
                                    .replace(/_/g, ' ')
                                    .replace(/\b\w/g, (c) => c.toUpperCase())}
                                </span>
                              </div>
                              <p
                                className={`text-xs mt-0.5 ${
                                  enabled
                                    ? 'text-base-content/60'
                                    : 'text-base-content/40'
                                }`}
                              >
                                {tool.description}
                              </p>
                            </div>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )
            )}
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`btn btn-ghost btn-sm btn-circle relative ${
          noneEnabled ? 'text-warning' : ''
        }`}
        aria-label="Configure tools"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        title={`${enabledCount} of ${totalCount} tools enabled`}
      >
        <span className="iconify lucide--wrench size-4" />
        {!allEnabled && (
          <span className="absolute -top-1 -right-1 badge badge-xs badge-primary">
            {enabledCount}
          </span>
        )}
      </button>
      {dropdown}
    </>
  );
}
