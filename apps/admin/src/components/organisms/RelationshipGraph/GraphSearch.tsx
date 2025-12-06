/**
 * Search component for the relationship graph
 * Allows users to search for nodes by name/label and jump to them
 */
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useReactFlow, type Node } from '@xyflow/react';
import { Icon } from '@/components/atoms/Icon';
import { DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT } from './graphLayoutUtils';
import type { GraphNodeData } from './useGraphData';

export interface GraphSearchProps {
  /** All nodes in the graph */
  nodes: Node<GraphNodeData>[];
  /** Callback when a node is focused */
  onNodeFocus?: (nodeId: string) => void;
}

interface SearchResult {
  id: string;
  label: string;
  type: string;
}

/**
 * GraphSearch component - provides search functionality for the graph
 */
export function GraphSearch({ nodes, onNodeFocus }: GraphSearchProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { setCenter, getNode } = useReactFlow();

  // Filter nodes based on search query
  const searchResults = useMemo<SearchResult[]>(() => {
    if (!searchQuery.trim()) return [];

    const query = searchQuery.toLowerCase();
    return nodes
      .filter((node) => {
        const label = node.data.label?.toLowerCase() || '';
        const type = node.data.type?.toLowerCase() || '';
        return label.includes(query) || type.includes(query);
      })
      .map((node) => ({
        id: node.id,
        label: node.data.label || 'Untitled',
        type: node.data.type || 'Unknown',
      }))
      .slice(0, 10); // Limit to 10 results
  }, [nodes, searchQuery]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchResults]);

  // Jump to a specific node
  const jumpToNode = useCallback(
    (nodeId: string) => {
      const node = getNode(nodeId);
      if (node) {
        // Center on the node with animation
        const x =
          node.position.x + (node.measured?.width || DEFAULT_NODE_WIDTH) / 2;
        const y =
          node.position.y + (node.measured?.height || DEFAULT_NODE_HEIGHT) / 2;

        setCenter(x, y, { zoom: 1.2, duration: 500 });
        onNodeFocus?.(nodeId);
      }
      setSearchQuery('');
      setIsOpen(false);
    },
    [getNode, setCenter, onNodeFocus]
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen || searchResults.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < searchResults.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : searchResults.length - 1
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (searchResults[selectedIndex]) {
            jumpToNode(searchResults[selectedIndex].id);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          setSearchQuery('');
          inputRef.current?.blur();
          break;
      }
    },
    [isOpen, searchResults, selectedIndex, jumpToNode]
  );

  // Handle input changes
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
      setIsOpen(true);
    },
    []
  );

  // Handle input focus
  const handleInputFocus = useCallback(() => {
    if (searchQuery.trim()) {
      setIsOpen(true);
    }
  }, [searchQuery]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as globalThis.Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as globalThis.Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="absolute top-4 left-4 z-10">
      <div className="relative">
        {/* Search input */}
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onKeyDown={handleKeyDown}
            placeholder="Search nodes..."
            className="input input-sm input-bordered w-56 pl-8 pr-8 bg-base-100 shadow-md"
          />
          <Icon
            icon="lucide--search"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-base-content/50"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setIsOpen(false);
                inputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 btn btn-ghost btn-xs btn-circle"
            >
              <Icon icon="lucide--x" className="size-3" />
            </button>
          )}
        </div>

        {/* Search results dropdown */}
        {isOpen && searchResults.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute top-full left-0 mt-1 w-72 bg-base-100 rounded-lg shadow-lg border border-base-300 max-h-64 overflow-y-auto"
          >
            <ul className="menu menu-sm p-1">
              {searchResults.map((result, index) => (
                <li key={result.id}>
                  <button
                    onClick={() => jumpToNode(result.id)}
                    className={`flex items-center gap-2 ${
                      index === selectedIndex ? 'active' : ''
                    }`}
                  >
                    <Icon
                      icon="lucide--circle"
                      className="size-3 text-primary"
                    />
                    <div className="flex-1 min-w-0 text-left">
                      <div className="font-medium truncate">{result.label}</div>
                      <div className="text-xs text-base-content/60">
                        {result.type}
                      </div>
                    </div>
                    <Icon
                      icon="lucide--arrow-right"
                      className="size-3 text-base-content/40"
                    />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* No results message */}
        {isOpen && searchQuery.trim() && searchResults.length === 0 && (
          <div
            ref={dropdownRef}
            className="absolute top-full left-0 mt-1 w-56 bg-base-100 rounded-lg shadow-lg border border-base-300 p-3 text-center"
          >
            <Icon
              icon="lucide--search-x"
              className="size-8 text-base-content/30 mx-auto mb-2"
            />
            <p className="text-sm text-base-content/60">No nodes found</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default GraphSearch;
