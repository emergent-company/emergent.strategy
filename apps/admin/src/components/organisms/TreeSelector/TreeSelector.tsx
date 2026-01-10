import { useState, useCallback, useEffect, useMemo } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';

/**
 * Generic tree node structure
 */
export interface TreeNode {
  id: string;
  name: string;
  hasChildren?: boolean;
  metadata?: Record<string, any>;
}

/**
 * Internal tree node with UI state
 */
interface TreeNodeState extends TreeNode {
  children: TreeNodeState[];
  isLoading: boolean;
  isExpanded: boolean;
  hasLoadedChildren: boolean;
  count?: number;
  isCountLoading?: boolean;
}

/**
 * Selection reference (id + name for display)
 */
export interface SelectionRef {
  id: string;
  name: string;
}

/**
 * Checkbox state for tri-state checkboxes
 */
type CheckboxState = 'checked' | 'unchecked' | 'indeterminate';

export interface TreeSelectorProps {
  /**
   * Function to load root-level nodes
   */
  loadRootNodes: () => Promise<TreeNode[]>;

  /**
   * Function to load children of a node
   */
  loadChildren: (nodeId: string) => Promise<TreeNode[]>;

  /**
   * Currently selected node IDs (with names for display)
   */
  selectedItems: SelectionRef[];

  /**
   * Currently excluded node IDs (with names for display)
   */
  excludedItems: SelectionRef[];

  /**
   * Callback when selection changes
   */
  onSelectionChange: (
    selected: SelectionRef[],
    excluded: SelectionRef[]
  ) => void;

  /**
   * Whether the selector is read-only
   */
  readonly?: boolean;

  /**
   * Whether to show item counts
   */
  showCounts?: boolean;

  /**
   * Function to load count for a node
   */
  onRequestCount?: (nodeId: string) => Promise<number>;

  /**
   * Custom icon renderer for nodes
   */
  renderNodeIcon?: (node: TreeNode) => React.ReactNode;

  /**
   * Custom label renderer for nodes
   */
  renderNodeLabel?: (node: TreeNode) => React.ReactNode;

  /**
   * Message to show when tree is empty
   */
  emptyMessage?: string;

  /**
   * Label for the count display (e.g., "files", "docs")
   */
  countLabel?: string;

  /**
   * Whether to auto-load root nodes on mount
   */
  autoLoad?: boolean;

  /**
   * Height constraint for the tree container
   */
  maxHeight?: string;
}

/**
 * TreeSelector - A generalized tree picker component
 *
 * Supports:
 * - Lazy loading children on expand
 * - Tri-state checkboxes (checked/unchecked/indeterminate)
 * - Include/exclude selection model
 * - Read-only mode
 * - Optional item counts
 */
export function TreeSelector({
  loadRootNodes,
  loadChildren,
  selectedItems,
  excludedItems,
  onSelectionChange,
  readonly = false,
  showCounts = false,
  onRequestCount,
  renderNodeIcon,
  renderNodeLabel,
  emptyMessage = 'No items found',
  countLabel = 'items',
  autoLoad = true,
  maxHeight = '400px',
}: TreeSelectorProps) {
  const [tree, setTree] = useState<TreeNodeState[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Convert selection arrays to maps for faster lookup
  const selectedMap = useMemo(() => {
    const map = new Map<string, SelectionRef>();
    selectedItems.forEach((item) => map.set(item.id, item));
    return map;
  }, [selectedItems]);

  const excludedMap = useMemo(() => {
    const map = new Map<string, SelectionRef>();
    excludedItems.forEach((item) => map.set(item.id, item));
    return map;
  }, [excludedItems]);

  // Load root nodes
  const loadRoot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nodes = await loadRootNodes();
      setTree(
        nodes.map((node) => ({
          ...node,
          children: [],
          isLoading: false,
          isExpanded: false,
          hasLoadedChildren: false,
        }))
      );
    } catch (err) {
      const e = err as Error;
      setError(e.message || 'Failed to load items');
    } finally {
      setLoading(false);
    }
  }, [loadRootNodes]);

  // Auto-load root nodes on mount
  useEffect(() => {
    if (autoLoad) {
      loadRoot();
    }
  }, [autoLoad, loadRoot]);

  // Tree manipulation helpers
  const updateTreeNode = useCallback(
    (
      nodes: TreeNodeState[],
      nodeId: string,
      updater: (node: TreeNodeState) => TreeNodeState
    ): TreeNodeState[] => {
      return nodes.map((node) => {
        if (node.id === nodeId) {
          return updater(node);
        }
        if (node.children.length > 0) {
          return {
            ...node,
            children: updateTreeNode(node.children, nodeId, updater),
          };
        }
        return node;
      });
    },
    []
  );

  const findTreeNode = useCallback(
    (nodes: TreeNodeState[], nodeId: string): TreeNodeState | null => {
      for (const node of nodes) {
        if (node.id === nodeId) return node;
        const found = findTreeNode(node.children, nodeId);
        if (found) return found;
      }
      return null;
    },
    []
  );

  const getDescendantIds = useCallback((node: TreeNodeState): string[] => {
    const ids: string[] = [];
    const collect = (n: TreeNodeState) => {
      ids.push(n.id);
      n.children.forEach(collect);
    };
    node.children.forEach(collect);
    return ids;
  }, []);

  const findAncestorIds = useCallback(
    (
      nodes: TreeNodeState[],
      targetId: string,
      path: string[] = []
    ): string[] | null => {
      for (const node of nodes) {
        if (node.id === targetId) {
          return path;
        }
        const result = findAncestorIds(node.children, targetId, [
          ...path,
          node.id,
        ]);
        if (result) return result;
      }
      return null;
    },
    []
  );

  // Calculate checkbox state for a node
  const getCheckboxState = useCallback(
    (nodeId: string): CheckboxState => {
      const node = findTreeNode(tree, nodeId);

      // If directly selected, it's checked (unless has excluded descendants)
      if (selectedMap.has(nodeId)) {
        if (node && node.children.length > 0) {
          const descendantIds = getDescendantIds(node);
          const hasExcludedDescendant = descendantIds.some((id) =>
            excludedMap.has(id)
          );
          if (hasExcludedDescendant) {
            return 'indeterminate';
          }
        }
        return 'checked';
      }

      // If excluded, it's unchecked
      if (excludedMap.has(nodeId)) {
        return 'unchecked';
      }

      // Check if any ancestor is selected
      const ancestorIds = findAncestorIds(tree, nodeId);
      if (ancestorIds) {
        const hasSelectedAncestor = ancestorIds.some((id) =>
          selectedMap.has(id)
        );
        if (hasSelectedAncestor) {
          // Inherited from ancestor - check for exclusions in descendants
          if (node && node.children.length > 0) {
            const descendantIds = getDescendantIds(node);
            const hasExcludedDescendant = descendantIds.some((id) =>
              excludedMap.has(id)
            );
            if (hasExcludedDescendant) {
              return 'indeterminate';
            }
          }
          return 'checked';
        }
      }

      return 'unchecked';
    },
    [
      tree,
      selectedMap,
      excludedMap,
      findTreeNode,
      getDescendantIds,
      findAncestorIds,
    ]
  );

  // Check if a node is implicitly selected (via ancestor)
  const isImplicitlySelected = useCallback(
    (nodeId: string): boolean => {
      if (selectedMap.has(nodeId)) return false;
      const ancestorIds = findAncestorIds(tree, nodeId);
      if (ancestorIds) {
        return ancestorIds.some((id) => selectedMap.has(id));
      }
      return false;
    },
    [tree, selectedMap, findAncestorIds]
  );

  // Handle node toggle
  const handleToggle = useCallback(
    (nodeId: string) => {
      if (readonly) return;

      const currentState = getCheckboxState(nodeId);
      const isImplicit = isImplicitlySelected(nodeId);
      const node = findTreeNode(tree, nodeId);

      let newSelected = new Map(selectedMap);
      let newExcluded = new Map(excludedMap);

      if (currentState === 'unchecked') {
        // Select this node
        if (isImplicit) {
          // Was excluded from an ancestor selection, remove exclusion
          newExcluded.delete(nodeId);
        } else {
          // Add to selected
          if (node) {
            newSelected.set(nodeId, { id: nodeId, name: node.name });
          }
        }
        // Clear any exclusions for descendants
        if (node) {
          const descendantIds = getDescendantIds(node);
          descendantIds.forEach((id) => newExcluded.delete(id));
        }
      } else {
        // Deselect this node
        if (isImplicit) {
          // Add to exclusions
          if (node) {
            newExcluded.set(nodeId, { id: nodeId, name: node.name });
          }
        } else {
          // Remove from selected
          newSelected.delete(nodeId);
        }
        // Remove any exclusions for descendants (they inherit the unchecked state)
        if (node) {
          const descendantIds = getDescendantIds(node);
          descendantIds.forEach((id) => newExcluded.delete(id));
        }
      }

      onSelectionChange(
        Array.from(newSelected.values()),
        Array.from(newExcluded.values())
      );
    },
    [
      readonly,
      getCheckboxState,
      isImplicitlySelected,
      findTreeNode,
      tree,
      selectedMap,
      excludedMap,
      getDescendantIds,
      onSelectionChange,
    ]
  );

  // Handle node expand/collapse
  const handleExpand = useCallback(
    async (nodeId: string) => {
      const node = findTreeNode(tree, nodeId);
      if (!node) return;

      if (node.isExpanded) {
        // Collapse
        setTree((prev) =>
          updateTreeNode(prev, nodeId, (n) => ({
            ...n,
            isExpanded: false,
          }))
        );
      } else {
        // Expand - load children if not loaded
        if (!node.hasLoadedChildren) {
          setTree((prev) =>
            updateTreeNode(prev, nodeId, (n) => ({
              ...n,
              isLoading: true,
            }))
          );

          try {
            const children = await loadChildren(nodeId);
            setTree((prev) =>
              updateTreeNode(prev, nodeId, (n) => ({
                ...n,
                children: children.map((child) => ({
                  ...child,
                  children: [],
                  isLoading: false,
                  isExpanded: false,
                  hasLoadedChildren: false,
                })),
                isLoading: false,
                isExpanded: true,
                hasLoadedChildren: true,
              }))
            );
          } catch (err) {
            console.error('Failed to load children:', err);
            setTree((prev) =>
              updateTreeNode(prev, nodeId, (n) => ({
                ...n,
                isLoading: false,
              }))
            );
          }
        } else {
          setTree((prev) =>
            updateTreeNode(prev, nodeId, (n) => ({
              ...n,
              isExpanded: true,
            }))
          );
        }
      }
    },
    [tree, findTreeNode, updateTreeNode, loadChildren]
  );

  // Handle count request
  const handleRequestCount = useCallback(
    async (nodeId: string) => {
      if (!onRequestCount) return;

      setTree((prev) =>
        updateTreeNode(prev, nodeId, (n) => ({
          ...n,
          isCountLoading: true,
        }))
      );

      try {
        const count = await onRequestCount(nodeId);
        setTree((prev) =>
          updateTreeNode(prev, nodeId, (n) => ({
            ...n,
            count,
            isCountLoading: false,
          }))
        );
      } catch (err) {
        console.error('Failed to load count:', err);
        setTree((prev) =>
          updateTreeNode(prev, nodeId, (n) => ({
            ...n,
            isCountLoading: false,
          }))
        );
      }
    },
    [onRequestCount, updateTreeNode]
  );

  // Select all root nodes
  const handleSelectAll = useCallback(() => {
    if (readonly) return;
    const allRoots = tree.map((node) => ({ id: node.id, name: node.name }));
    onSelectionChange(allRoots, []);
  }, [readonly, tree, onSelectionChange]);

  // Clear all selections
  const handleClearAll = useCallback(() => {
    if (readonly) return;
    onSelectionChange([], []);
  }, [readonly, onSelectionChange]);

  // Render a single tree node
  const renderNode = (node: TreeNodeState, depth: number = 0) => {
    const checkboxState = getCheckboxState(node.id);
    const hasChildren = node.children.length > 0 || node.hasChildren !== false;
    const isSelected = checkboxState !== 'unchecked';

    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-2 py-2 px-3 hover:bg-base-300 border-b border-base-300/50 ${
            readonly ? '' : 'cursor-pointer'
          }`}
          style={{ paddingLeft: `${12 + depth * 24}px` }}
        >
          {/* Expand/Collapse Button */}
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-square"
            onClick={(e) => {
              e.stopPropagation();
              handleExpand(node.id);
            }}
            disabled={node.isLoading}
          >
            {node.isLoading ? (
              <Spinner size="xs" />
            ) : hasChildren ? (
              <Icon
                icon={
                  node.isExpanded
                    ? 'lucide--chevron-down'
                    : 'lucide--chevron-right'
                }
                className="w-4 h-4"
              />
            ) : (
              <span className="w-4" />
            )}
          </button>

          {/* Checkbox */}
          {!readonly && (
            <input
              type="checkbox"
              ref={(el) => {
                if (el) {
                  el.indeterminate = checkboxState === 'indeterminate';
                }
              }}
              checked={
                checkboxState === 'checked' || checkboxState === 'indeterminate'
              }
              onChange={() => handleToggle(node.id)}
              className="checkbox checkbox-primary checkbox-sm"
            />
          )}

          {/* Node Icon */}
          {renderNodeIcon ? (
            renderNodeIcon(node)
          ) : (
            <Icon
              icon={
                node.metadata?.isSharedDrive
                  ? 'lucide--users'
                  : 'lucide--folder'
              }
              className="w-5 h-5 text-base-content/70 flex-shrink-0"
            />
          )}

          {/* Node Label */}
          <span
            className="flex-1 truncate"
            onClick={() => !readonly && handleToggle(node.id)}
          >
            {renderNodeLabel ? renderNodeLabel(node) : node.name}
          </span>

          {/* Count Display */}
          {showCounts && isSelected && (
            <div className="flex items-center gap-2">
              {node.isCountLoading ? (
                <Spinner size="xs" />
              ) : node.count !== undefined ? (
                <span
                  className={`text-xs ${
                    node.count > 1000
                      ? 'text-warning font-medium'
                      : 'text-base-content/60'
                  }`}
                >
                  ~{node.count.toLocaleString()} {countLabel}
                </span>
              ) : onRequestCount ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-xs text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRequestCount(node.id);
                  }}
                >
                  <Icon icon="lucide--calculator" className="w-3 h-3 mr-1" />
                  Count
                </button>
              ) : null}
            </div>
          )}
        </div>

        {/* Children */}
        {node.isExpanded && node.children.length > 0 && (
          <div>
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
        <span className="ml-3">Loading...</span>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="alert alert-error">
        <Icon icon="lucide--alert-circle" className="w-5 h-5" />
        <span>{error}</span>
        <button className="btn btn-sm btn-ghost" onClick={loadRoot}>
          Retry
        </button>
      </div>
    );
  }

  // Empty state
  if (tree.length === 0) {
    return (
      <div className="text-center py-8 text-base-content/70">
        <Icon
          icon="lucide--folder-open"
          className="w-12 h-12 mx-auto mb-2 opacity-50"
        />
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header with controls */}
      {!readonly && (
        <div className="flex justify-between items-center">
          <span className="text-sm text-base-content/70">
            {selectedItems.length === 0
              ? 'No items selected'
              : `${selectedItems.length} item(s) selected`}
            {excludedItems.length > 0 && ` (${excludedItems.length} excluded)`}
          </span>
          <div className="space-x-2">
            <button
              type="button"
              className="btn btn-xs btn-ghost"
              onClick={handleSelectAll}
            >
              Select All
            </button>
            <button
              type="button"
              className="btn btn-xs btn-ghost"
              onClick={handleClearAll}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Tree */}
      <div
        className="bg-base-200 rounded-lg overflow-y-auto"
        style={{ maxHeight }}
      >
        {tree.map((node) => renderNode(node))}
      </div>
    </div>
  );
}
