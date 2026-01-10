import { useCallback, useMemo } from 'react';
import { Icon } from '@/components/atoms/Icon';
import {
  TreeSelector,
  type TreeNode,
  type SelectionRef,
} from '../TreeSelector';
import { EmailFilterForm, type EmailFilters } from '../EmailFilterForm';

/**
 * Folder reference for Drive/ClickUp sync
 */
export interface FolderRef {
  id: string;
  name: string;
}

/**
 * Complete sync options
 */
export interface SyncOptions {
  limit?: number;
  incrementalOnly?: boolean;
  selectedFolders?: FolderRef[];
  excludedFolders?: FolderRef[];
  filters?: EmailFilters;
}

/**
 * API functions interface for data loading
 */
export interface SyncOptionsApiFunctions {
  /**
   * Load root-level folders/spaces
   */
  loadRootNodes?: () => Promise<TreeNode[]>;

  /**
   * Load children of a folder/space
   */
  loadChildren?: (nodeId: string) => Promise<TreeNode[]>;

  /**
   * Get item count for a folder
   */
  getItemCount?: (nodeId: string) => Promise<number>;
}

export interface SyncOptionsFormProps {
  /**
   * Source type determines which UI elements to show
   */
  sourceType: 'email' | 'drive' | 'clickup-document' | string;

  /**
   * Current sync options
   */
  options: SyncOptions;

  /**
   * Callback when options change
   */
  onChange: (options: SyncOptions) => void;

  /**
   * Whether the form is read-only
   */
  readonly?: boolean;

  /**
   * API functions for loading tree data
   */
  apiFunctions?: SyncOptionsApiFunctions;

  /**
   * Label for items (e.g., "files", "emails", "docs")
   */
  itemLabel?: string;

  /**
   * Maximum value for limit slider
   */
  maxLimit?: number;

  /**
   * Available email folders for filtering
   */
  availableEmailFolders?: string[];
}

/**
 * SyncOptionsForm - Unified form for sync configuration options
 *
 * Combines:
 * - Common options (limit, incremental toggle)
 * - Source-specific selectors (folder tree for drive/clickup, filters for email)
 */
export function SyncOptionsForm({
  sourceType,
  options,
  onChange,
  readonly = false,
  apiFunctions,
  itemLabel,
  maxLimit = 500,
  availableEmailFolders = [],
}: SyncOptionsFormProps) {
  const isDrive = sourceType === 'drive';
  const isClickUp = sourceType === 'clickup-document';
  const isEmail = sourceType === 'email';
  const hasTreeSelector = isDrive || isClickUp;

  // Derive item label from source type if not provided
  const derivedItemLabel = useMemo(() => {
    if (itemLabel) return itemLabel;
    switch (sourceType) {
      case 'email':
        return 'emails';
      case 'drive':
        return 'files';
      case 'clickup-document':
        return 'docs';
      default:
        return 'items';
    }
  }, [sourceType, itemLabel]);

  // Handle limit change
  const handleLimitChange = useCallback(
    (limit: number) => {
      onChange({ ...options, limit });
    },
    [options, onChange]
  );

  // Handle incremental toggle
  const handleIncrementalChange = useCallback(
    (incrementalOnly: boolean) => {
      onChange({ ...options, incrementalOnly });
    },
    [options, onChange]
  );

  // Handle folder selection change
  const handleFoldersChange = useCallback(
    (selected: SelectionRef[], excluded: SelectionRef[]) => {
      onChange({
        ...options,
        selectedFolders: selected.length > 0 ? selected : undefined,
        excludedFolders: excluded.length > 0 ? excluded : undefined,
      });
    },
    [options, onChange]
  );

  // Handle filters change
  const handleFiltersChange = useCallback(
    (filters: EmailFilters) => {
      onChange({
        ...options,
        filters: Object.keys(filters).length > 0 ? filters : undefined,
      });
    },
    [options, onChange]
  );

  // Default load functions (no-op if not provided)
  const loadRootNodes = useCallback(async (): Promise<TreeNode[]> => {
    if (apiFunctions?.loadRootNodes) {
      return apiFunctions.loadRootNodes();
    }
    return [];
  }, [apiFunctions]);

  const loadChildren = useCallback(
    async (nodeId: string): Promise<TreeNode[]> => {
      if (apiFunctions?.loadChildren) {
        return apiFunctions.loadChildren(nodeId);
      }
      return [];
    },
    [apiFunctions]
  );

  const getItemCount = useCallback(
    async (nodeId: string): Promise<number> => {
      if (apiFunctions?.getItemCount) {
        return apiFunctions.getItemCount(nodeId);
      }
      return 0;
    },
    [apiFunctions]
  );

  return (
    <div className="space-y-6">
      {/* Common Options */}
      <div className="space-y-4">
        <h4 className="font-medium flex items-center gap-2">
          <Icon icon="lucide--settings" className="w-4 h-4" />
          Sync Settings
        </h4>

        {/* Limit Slider */}
        <div className="form-control">
          <label className="label py-1">
            <span className="label-text">
              Maximum {derivedItemLabel} to sync
            </span>
            <span className="label-text-alt">{options.limit || 100}</span>
          </label>
          <input
            type="range"
            min="10"
            max={maxLimit}
            step="10"
            value={options.limit || 100}
            onChange={(e) => handleLimitChange(parseInt(e.target.value))}
            className="range range-primary range-sm"
            disabled={readonly}
          />
          <div className="flex justify-between text-xs px-2 mt-1 text-base-content/60">
            <span>10</span>
            <span>{Math.round(maxLimit / 4)}</span>
            <span>{Math.round(maxLimit / 2)}</span>
            <span>{maxLimit}</span>
          </div>
        </div>

        {/* Incremental Only Toggle */}
        <div className="form-control">
          <label className="label cursor-pointer">
            <div className="flex flex-col">
              <span className="label-text">Incremental sync only</span>
              <span className="label-text text-xs opacity-60">
                {options.incrementalOnly !== false
                  ? `Only syncs ${derivedItemLabel} received after last sync`
                  : `Re-scans all ${derivedItemLabel} (can re-import deleted items)`}
              </span>
            </div>
            <input
              type="checkbox"
              checked={options.incrementalOnly !== false}
              onChange={(e) => handleIncrementalChange(e.target.checked)}
              className="checkbox checkbox-primary"
              disabled={readonly}
            />
          </label>
        </div>
      </div>

      {/* Source-specific: Folder/Space Selector */}
      {hasTreeSelector && apiFunctions && (
        <div className="space-y-4">
          <div className="divider">
            {isDrive ? 'Folder Selection' : 'Space Selection'}
          </div>

          <TreeSelector
            loadRootNodes={loadRootNodes}
            loadChildren={loadChildren}
            selectedItems={options.selectedFolders || []}
            excludedItems={options.excludedFolders || []}
            onSelectionChange={handleFoldersChange}
            readonly={readonly}
            showCounts={true}
            onRequestCount={
              apiFunctions.getItemCount ? getItemCount : undefined
            }
            countLabel={derivedItemLabel}
            emptyMessage={
              isDrive
                ? 'No folders found in your Drive'
                : 'No spaces found in your workspace'
            }
            renderNodeIcon={(node) => (
              <Icon
                icon={
                  node.metadata?.isSharedDrive
                    ? 'lucide--users'
                    : node.metadata?.type === 'workspace'
                    ? 'lucide--building'
                    : node.metadata?.type === 'space'
                    ? 'lucide--layout-grid'
                    : 'lucide--folder'
                }
                className="w-5 h-5 text-base-content/70 flex-shrink-0"
              />
            )}
          />

          {/* Selection summary */}
          {!readonly && (
            <div className="alert alert-info py-2">
              <Icon icon="lucide--info" className="w-5 h-5" />
              <span>
                Will sync up to <strong>{options.limit || 100}</strong>{' '}
                {derivedItemLabel}
                {options.selectedFolders && options.selectedFolders.length > 0
                  ? ` from ${options.selectedFolders.length} selected ${
                      isDrive ? 'folder(s)' : 'space(s)'
                    }`
                  : isDrive
                  ? ' from your entire Drive'
                  : ' from all spaces'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Source-specific: Email Filters */}
      {isEmail && (
        <div className="space-y-4">
          <div className="divider">Email Filters</div>

          <EmailFilterForm
            filters={options.filters || {}}
            onChange={handleFiltersChange}
            readonly={readonly}
            showFolderFilter={availableEmailFolders.length > 0}
            availableFolders={availableEmailFolders}
          />
        </div>
      )}

      {/* Read-only summary for non-tree sources */}
      {readonly && !hasTreeSelector && !isEmail && (
        <div className="bg-base-200 rounded-lg p-4">
          <div className="text-sm text-base-content/70">
            <p>
              Limit: {options.limit || 100} {derivedItemLabel}
            </p>
            <p>
              Mode:{' '}
              {options.incrementalOnly !== false ? 'Incremental' : 'Full scan'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
