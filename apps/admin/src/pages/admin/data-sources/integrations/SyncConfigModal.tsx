import { useState, useEffect, useCallback, useRef } from 'react';
import { Modal } from '@/components/organisms/Modal/Modal';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import {
  SyncConfiguration,
  SyncConfigurationListResponse,
} from './sync-config-types';

/**
 * Folder statistics from the server (for email)
 */
interface FolderStats {
  path: string;
  name: string;
  totalMessages: number;
  unreadMessages: number;
}

/**
 * Sync preview response from the server
 */
interface SyncPreview {
  folders: FolderStats[];
  totalEmails: number;
  totalUnread: number;
  matchingEmails: number;
  importedEmails: number;
  newEmails: number;
  lastSyncedAt?: string;
  appliedFilters?: EmailFilters;
}

/**
 * Browse result item from the server (for Drive folders)
 */
interface BrowseItem {
  id: string;
  itemId: string;
  name: string;
  path?: string;
  isFolder: boolean;
  mimeType?: string;
  size?: number;
  modifiedTime?: string;
  webViewLink?: string;
  isSharedDrive?: boolean;
}

/**
 * Browse result from the server
 */
interface BrowseResult {
  items: BrowseItem[];
  total: number;
  hasMore: boolean;
  nextOffset?: number;
}

/**
 * Email filter options
 */
interface EmailFilters {
  from?: string;
  to?: string;
  subject?: string;
  text?: string;
  since?: string;
  before?: string;
  seen?: boolean;
  flagged?: boolean;
  folders?: string[];
}

/**
 * Folder reference for sync config
 */
interface FolderRef {
  id: string;
  name: string;
}

/**
 * ClickUp browse item from the server
 */
interface ClickUpBrowseItem {
  id: string;
  name: string;
  type: 'workspace' | 'space' | 'doc';
  path: string;
  isFolder: boolean;
  archived?: boolean;
  docCount?: number;
}

/**
 * ClickUp browse result
 */
interface ClickUpBrowseResult {
  items: ClickUpBrowseItem[];
  total: number;
  hasMore: boolean;
}

/**
 * ClickUp space reference for selection
 */
interface SpaceRef {
  id: string;
  name: string;
  docCount?: number;
}

/**
 * ClickUp workspace info
 */
interface WorkspaceInfo {
  id: string;
  name: string;
}

/**
 * Sync options sent to the server
 */
interface SyncOptions {
  limit?: number;
  filters?: EmailFilters;
  incrementalOnly?: boolean;
  // Drive-specific options
  selectedFolders?: FolderRef[];
  excludedFolders?: FolderRef[];
}

/**
 * Saved folder configuration from the server
 */
interface FolderConfig {
  selectedFolders: FolderRef[];
  excludedFolders: FolderRef[];
}

/**
 * Folder count response from the server
 */
interface FolderCountResponse {
  folderId: string;
  estimatedCount: number;
  isExact: boolean;
}

/**
 * Sync result from the server (legacy format)
 */
interface SyncResult {
  totalImported: number;
  totalFailed: number;
  totalSkipped: number;
  documentIds: string[];
  errors: Array<{ itemId: string; error: string }>;
}

/**
 * Sync job response from the server (new async format)
 */
interface SyncJobDto {
  id: string;
  integrationId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  totalItems: number;
  processedItems: number;
  successfulItems: number;
  failedItems: number;
  skippedItems: number;
  currentPhase: string | null;
  statusMessage: string | null;
  documentIds: string[];
  logs: Array<{
    timestamp: string;
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
    details?: Record<string, any>;
  }>;
  errorMessage: string | null;
  triggerType: 'manual' | 'scheduled';
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

/**
 * FetchJson init options - matches useApi hook
 */
type FetchJsonInit<B = unknown> = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: B;
  headers?: Record<string, string>;
  credentials?: RequestCredentials;
  json?: boolean;
};

export interface SyncConfigModalProps {
  open: boolean;
  integrationId: string;
  integrationName: string;
  sourceType: 'email' | 'drive' | string;
  apiBase: string;
  fetchJson: <T, B = unknown>(
    url: string,
    init?: FetchJsonInit<B>
  ) => Promise<T>;
  onClose: () => void;
  onSyncStarted?: (job: SyncJobDto) => void;
  /** Callback to open the configuration management modal */
  onManageConfigurations?: () => void;
  /** @deprecated Use onSyncStarted instead - sync is now async */
  onSuccess?: (result: SyncResult) => void;
}

type SyncStep = 'configure' | 'progress' | 'complete';

/**
 * Tree node for folder hierarchy
 */
interface FolderTreeNode {
  id: string;
  name: string;
  isSharedDrive?: boolean;
  children: FolderTreeNode[];
  isLoading: boolean;
  isExpanded: boolean;
  hasLoadedChildren: boolean;
  fileCount?: number;
  isCountLoading?: boolean;
}

/**
 * Checkbox state for a folder
 */
type CheckboxState = 'checked' | 'unchecked' | 'indeterminate';

export function SyncConfigModal({
  open,
  integrationId,
  integrationName,
  sourceType,
  apiBase,
  fetchJson,
  onClose,
  onSyncStarted,
  onManageConfigurations,
  onSuccess,
}: SyncConfigModalProps) {
  const isDrive = sourceType === 'drive';
  const isClickUp = sourceType === 'clickup-document';

  const [step, setStep] = useState<SyncStep>('configure');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncJob, setSyncJob] = useState<SyncJobDto | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  // Saved configurations state
  const [savedConfigs, setSavedConfigs] = useState<SyncConfiguration[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [loadingConfigs, setLoadingConfigs] = useState(false);

  // Email-specific state
  const [preview, setPreview] = useState<SyncPreview | null>(null);
  const [limit, setLimit] = useState(100);
  const [incrementalOnly, setIncrementalOnly] = useState(true);
  const [filters, setFilters] = useState<EmailFilters>({});
  const [showFilters, setShowFilters] = useState(false);

  // Drive-specific state - folder tree
  const [folderTree, setFolderTree] = useState<FolderTreeNode[]>([]);
  // Store full folder refs (id + name) to avoid tree traversal issues with lazy loading
  const [selectedFolderRefs, setSelectedFolderRefs] = useState<
    Map<string, FolderRef>
  >(new Map());
  const [excludedFolderRefs, setExcludedFolderRefs] = useState<
    Map<string, FolderRef>
  >(new Map());
  const [folderCounts, setFolderCounts] = useState<Map<string, number>>(
    new Map()
  );
  const [driveLimit, setDriveLimit] = useState(100);

  // ClickUp-specific state
  const [clickUpWorkspace, setClickUpWorkspace] =
    useState<WorkspaceInfo | null>(null);
  const [clickUpSpaces, setClickUpSpaces] = useState<SpaceRef[]>([]);
  const [selectedSpaceRefs, setSelectedSpaceRefs] = useState<
    Map<string, SpaceRef>
  >(new Map());
  const [clickUpLimit, setClickUpLimit] = useState(100);
  const [loadingSpaceCounts, setLoadingSpaceCounts] = useState<Set<string>>(
    new Set()
  );

  // Use refs to access current values without triggering effect re-runs
  const filtersRef = useRef(filters);
  const limitRef = useRef(limit);
  const incrementalOnlyRef = useRef(incrementalOnly);

  // Keep refs in sync with state
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);
  useEffect(() => {
    limitRef.current = limit;
  }, [limit]);
  useEffect(() => {
    incrementalOnlyRef.current = incrementalOnly;
  }, [incrementalOnly]);

  // ---------- Tree Helper Functions ----------

  /**
   * Create a new folder tree node from a browse item
   */
  const createTreeNode = (item: BrowseItem): FolderTreeNode => ({
    id: item.id,
    name: item.name,
    isSharedDrive: item.isSharedDrive,
    children: [],
    isLoading: false,
    isExpanded: false,
    hasLoadedChildren: false,
  });

  /**
   * Update a node in the tree immutably
   */
  const updateTreeNode = (
    nodes: FolderTreeNode[],
    nodeId: string,
    updater: (node: FolderTreeNode) => FolderTreeNode
  ): FolderTreeNode[] => {
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
  };

  /**
   * Find a node in the tree
   */
  const findTreeNode = (
    nodes: FolderTreeNode[],
    nodeId: string
  ): FolderTreeNode | null => {
    for (const node of nodes) {
      if (node.id === nodeId) return node;
      const found = findTreeNode(node.children, nodeId);
      if (found) return found;
    }
    return null;
  };

  /**
   * Get all descendant IDs of a node
   */
  const getDescendantIds = (node: FolderTreeNode): string[] => {
    const ids: string[] = [];
    const collect = (n: FolderTreeNode) => {
      ids.push(n.id);
      n.children.forEach(collect);
    };
    node.children.forEach(collect);
    return ids;
  };

  /**
   * Find ancestor IDs of a node
   */
  const findAncestorIds = (
    nodes: FolderTreeNode[],
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
  };

  /**
   * Calculate checkbox state for a folder
   */
  const getCheckboxState = useCallback(
    (nodeId: string): CheckboxState => {
      const node = findTreeNode(folderTree, nodeId);

      // If directly selected, it's checked (unless excluded)
      if (selectedFolderRefs.has(nodeId)) {
        // Check if any descendants are excluded
        if (node && node.children.length > 0) {
          const descendantIds = getDescendantIds(node);
          const hasExcludedDescendant = descendantIds.some((id) =>
            excludedFolderRefs.has(id)
          );
          if (hasExcludedDescendant) {
            return 'indeterminate';
          }
        }
        return 'checked';
      }

      // If excluded, it's unchecked
      if (excludedFolderRefs.has(nodeId)) {
        return 'unchecked';
      }

      // Check if any ancestor is selected
      const ancestorIds = findAncestorIds(folderTree, nodeId);
      if (ancestorIds) {
        const hasSelectedAncestor = ancestorIds.some((id) =>
          selectedFolderRefs.has(id)
        );
        if (hasSelectedAncestor) {
          // Inherited from ancestor - check for exclusions in descendants
          if (node && node.children.length > 0) {
            const descendantIds = getDescendantIds(node);
            const hasExcludedDescendant = descendantIds.some((id) =>
              excludedFolderRefs.has(id)
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
    [folderTree, selectedFolderRefs, excludedFolderRefs]
  );

  /**
   * Check if a node is implicitly selected (via ancestor)
   */
  const isImplicitlySelected = useCallback(
    (nodeId: string): boolean => {
      if (selectedFolderRefs.has(nodeId)) return false; // Explicitly selected
      const ancestorIds = findAncestorIds(folderTree, nodeId);
      if (ancestorIds) {
        return ancestorIds.some((id) => selectedFolderRefs.has(id));
      }
      return false;
    },
    [folderTree, selectedFolderRefs]
  );

  // ---------- API Functions ----------

  /**
   * Load saved folder configuration
   */
  const loadSavedConfig = useCallback(async () => {
    try {
      const config = await fetchJson<FolderConfig>(
        `${apiBase}/api/data-source-integrations/${integrationId}/folder-config`
      );

      if (config.selectedFolders && config.selectedFolders.length > 0) {
        // Store full folder refs (id + name) directly
        const refsMap = new Map<string, FolderRef>();
        config.selectedFolders.forEach((f) => refsMap.set(f.id, f));
        setSelectedFolderRefs(refsMap);
      }
      if (config.excludedFolders && config.excludedFolders.length > 0) {
        // Store full folder refs (id + name) directly
        const refsMap = new Map<string, FolderRef>();
        config.excludedFolders.forEach((f) => refsMap.set(f.id, f));
        setExcludedFolderRefs(refsMap);
      }
    } catch (err) {
      // No saved config is fine, just continue with empty selection
      console.debug('No saved folder config found');
    }
  }, [apiBase, fetchJson, integrationId]);

  /**
   * Save folder configuration for recurring syncs
   */
  const saveConfiguration = async () => {
    setSavingConfig(true);
    setError(null);
    try {
      // Use stored folder refs directly - no tree traversal needed
      const selectedFolders = Array.from(selectedFolderRefs.values());
      const excludedFolders = Array.from(excludedFolderRefs.values());

      await fetchJson<{ success: boolean }, FolderConfig>(
        `${apiBase}/api/data-source-integrations/${integrationId}/folder-config`,
        {
          method: 'PATCH',
          body: { selectedFolders, excludedFolders },
        }
      );

      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 3000);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to save configuration');
    } finally {
      setSavingConfig(false);
    }
  };

  /**
   * Fetch file count for a folder
   */
  const fetchFolderCount = async (folderId: string) => {
    // Mark as loading in tree
    setFolderTree((prev) =>
      updateTreeNode(prev, folderId, (node) => ({
        ...node,
        isCountLoading: true,
      }))
    );

    try {
      const result = await fetchJson<FolderCountResponse, { folderId: string }>(
        `${apiBase}/api/data-source-integrations/${integrationId}/folder-count`,
        {
          method: 'POST',
          body: { folderId },
        }
      );

      setFolderCounts((prev) =>
        new Map(prev).set(folderId, result.estimatedCount)
      );
      setFolderTree((prev) =>
        updateTreeNode(prev, folderId, (node) => ({
          ...node,
          fileCount: result.estimatedCount,
          isCountLoading: false,
        }))
      );
    } catch (err) {
      console.error('Failed to fetch folder count:', err);
      setFolderTree((prev) =>
        updateTreeNode(prev, folderId, (node) => ({
          ...node,
          isCountLoading: false,
        }))
      );
    }
  };

  /**
   * Load children of a folder
   */
  const loadFolderChildren = async (folderId: string) => {
    setFolderTree((prev) =>
      updateTreeNode(prev, folderId, (node) => ({
        ...node,
        isLoading: true,
      }))
    );

    try {
      const data = await fetchJson<
        BrowseResult,
        { folder: string; limit: number }
      >(`${apiBase}/api/data-source-integrations/${integrationId}/browse`, {
        method: 'POST',
        body: { folder: folderId, limit: 100 },
      });

      const childFolders = data.items
        .filter((item) => item.isFolder)
        .map(createTreeNode);

      setFolderTree((prev) =>
        updateTreeNode(prev, folderId, (node) => ({
          ...node,
          children: childFolders,
          isLoading: false,
          isExpanded: true,
          hasLoadedChildren: true,
        }))
      );
    } catch (err) {
      console.error('Failed to load folder children:', err);
      setFolderTree((prev) =>
        updateTreeNode(prev, folderId, (node) => ({
          ...node,
          isLoading: false,
        }))
      );
    }
  };

  // Load email preview
  const loadEmailPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const currentFilters = filtersRef.current;
      const options: SyncOptions = {
        limit: limitRef.current,
        incrementalOnly: incrementalOnlyRef.current,
        filters:
          Object.keys(currentFilters).length > 0 ? currentFilters : undefined,
      };

      const data = await fetchJson<SyncPreview, SyncOptions>(
        `${apiBase}/api/data-source-integrations/${integrationId}/sync-preview`,
        {
          method: 'POST',
          body: options,
        }
      );
      setPreview(data);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to load sync preview');
    } finally {
      setLoading(false);
    }
  }, [apiBase, fetchJson, integrationId]);

  // Load Drive folders (root level)
  const loadDriveFolders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<BrowseResult>(
        `${apiBase}/api/data-source-integrations/${integrationId}/browse`,
        {
          method: 'POST',
          body: { folder: null, limit: 100 },
        }
      );

      // Filter to only show folders
      const folderItems = data.items.filter((item) => item.isFolder);
      const treeNodes = folderItems.map(createTreeNode);
      setFolderTree(treeNodes);

      // Load saved config after tree is ready
      await loadSavedConfig();
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to load folders');
    } finally {
      setLoading(false);
    }
  }, [apiBase, fetchJson, integrationId, loadSavedConfig]);

  // Load ClickUp workspaces and spaces
  const loadClickUpData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // First, get workspaces (root level browse)
      const workspaceData = await fetchJson<ClickUpBrowseResult>(
        `${apiBase}/api/data-source-integrations/${integrationId}/browse`,
        {
          method: 'POST',
          body: { folder: null, limit: 100 },
        }
      );

      if (workspaceData.items.length === 0) {
        setError('No workspaces found. Please check your API token.');
        return;
      }

      // Use first workspace (most common case)
      const workspace = workspaceData.items[0];
      setClickUpWorkspace({ id: workspace.id, name: workspace.name });

      // Get spaces for this workspace
      const spacesData = await fetchJson<ClickUpBrowseResult>(
        `${apiBase}/api/data-source-integrations/${integrationId}/browse`,
        {
          method: 'POST',
          body: { folder: `workspace:${workspace.id}`, limit: 100 },
        }
      );

      const spaces: SpaceRef[] = spacesData.items.map((item) => ({
        id: item.id,
        name: item.name,
        docCount: item.docCount,
      }));
      setClickUpSpaces(spaces);

      // Load saved space selection if any
      try {
        const config = await fetchJson<{ selectedSpaces?: SpaceRef[] }>(
          `${apiBase}/api/data-source-integrations/${integrationId}/folder-config`
        );

        if (config.selectedSpaces && config.selectedSpaces.length > 0) {
          const refsMap = new Map<string, SpaceRef>();
          config.selectedSpaces.forEach((s) => refsMap.set(s.id, s));
          setSelectedSpaceRefs(refsMap);
        }
      } catch {
        // No saved config is fine
        console.debug('No saved ClickUp config found');
      }
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to load ClickUp data');
    } finally {
      setLoading(false);
    }
  }, [apiBase, fetchJson, integrationId]);

  // Load doc count for a space
  const loadSpaceDocCount = async (spaceId: string) => {
    if (!clickUpWorkspace) return;

    setLoadingSpaceCounts((prev) => new Set(prev).add(spaceId));

    try {
      const docsData = await fetchJson<ClickUpBrowseResult>(
        `${apiBase}/api/data-source-integrations/${integrationId}/browse`,
        {
          method: 'POST',
          body: {
            folder: `space:${clickUpWorkspace.id}:${spaceId}`,
            limit: 100,
          },
        }
      );

      // Update space with doc count
      setClickUpSpaces((prev) =>
        prev.map((space) =>
          space.id === spaceId ? { ...space, docCount: docsData.total } : space
        )
      );
    } catch (err) {
      console.error(`Failed to load doc count for space ${spaceId}:`, err);
    } finally {
      setLoadingSpaceCounts((prev) => {
        const next = new Set(prev);
        next.delete(spaceId);
        return next;
      });
    }
  };

  // Load saved sync configurations
  const loadSavedConfigurations = useCallback(async () => {
    setLoadingConfigs(true);
    try {
      const response = await fetchJson<SyncConfigurationListResponse>(
        `${apiBase}/api/data-source-integrations/${integrationId}/sync-configurations`
      );
      setSavedConfigs(response.configurations);
      // Auto-select default configuration if exists
      const defaultConfig = response.configurations.find((c) => c.isDefault);
      if (defaultConfig) {
        setSelectedConfigId(defaultConfig.id);
        // Apply default config settings
        applyConfiguration(defaultConfig);
      }
    } catch (err) {
      // Silent fail - configurations are optional
      console.debug('Failed to load saved configurations:', err);
      setSavedConfigs([]);
    } finally {
      setLoadingConfigs(false);
    }
  }, [apiBase, fetchJson, integrationId]);

  // Apply a configuration's settings to the form
  const applyConfiguration = (config: SyncConfiguration) => {
    if (config.options.limit) {
      if (isDrive) {
        setDriveLimit(config.options.limit);
      } else if (isClickUp) {
        setClickUpLimit(config.options.limit);
      } else {
        setLimit(config.options.limit);
      }
    }
    if (config.options.incrementalOnly !== undefined) {
      setIncrementalOnly(config.options.incrementalOnly);
    }
    if (config.options.filters) {
      setFilters(config.options.filters);
      setShowFilters(Object.keys(config.options.filters).length > 0);
    }
  };

  // Handle configuration selection change
  const handleConfigSelect = (configId: string | null) => {
    setSelectedConfigId(configId);
    if (configId) {
      const config = savedConfigs.find((c) => c.id === configId);
      if (config) {
        applyConfiguration(config);
      }
    }
  };

  // Load data when modal opens
  useEffect(() => {
    if (open) {
      // Reset state when opening
      setStep('configure');
      setSyncJob(null);
      setError(null);
      setConfigSaved(false);
      setSelectedConfigId(null);

      // Load saved configurations
      loadSavedConfigurations();

      if (isDrive) {
        setSelectedFolderRefs(new Map());
        setExcludedFolderRefs(new Map());
        setFolderCounts(new Map());
        loadDriveFolders();
      } else if (isClickUp) {
        setClickUpWorkspace(null);
        setClickUpSpaces([]);
        setSelectedSpaceRefs(new Map());
        loadClickUpData();
      } else {
        loadEmailPreview();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isDrive, isClickUp]);

  // ---------- Event Handlers ----------

  /**
   * Handle folder checkbox toggle
   */
  const handleFolderToggle = (nodeId: string) => {
    const currentState = getCheckboxState(nodeId);
    const isImplicit = isImplicitlySelected(nodeId);
    const node = findTreeNode(folderTree, nodeId);

    if (currentState === 'unchecked') {
      // Select this folder
      if (isImplicit) {
        // Was excluded from an ancestor selection, remove exclusion
        setExcludedFolderRefs((prev) => {
          const next = new Map(prev);
          next.delete(nodeId);
          return next;
        });
      } else {
        // Add to selected with full folder ref (id + name)
        if (node) {
          setSelectedFolderRefs((prev) =>
            new Map(prev).set(nodeId, { id: nodeId, name: node.name })
          );
        }
      }
      // Clear any exclusions for descendants
      if (node) {
        const descendantIds = getDescendantIds(node);
        if (descendantIds.length > 0) {
          setExcludedFolderRefs((prev) => {
            const next = new Map(prev);
            descendantIds.forEach((id) => next.delete(id));
            return next;
          });
        }
      }
    } else {
      // Deselect this folder
      if (isImplicit) {
        // Add to exclusions with full folder ref
        if (node) {
          setExcludedFolderRefs((prev) =>
            new Map(prev).set(nodeId, { id: nodeId, name: node.name })
          );
        }
      } else {
        // Remove from selected
        setSelectedFolderRefs((prev) => {
          const next = new Map(prev);
          next.delete(nodeId);
          return next;
        });
      }
      // Remove any exclusions for descendants (they inherit the unchecked state)
      if (node) {
        const descendantIds = getDescendantIds(node);
        if (descendantIds.length > 0) {
          setExcludedFolderRefs((prev) => {
            const next = new Map(prev);
            descendantIds.forEach((id) => next.delete(id));
            return next;
          });
        }
      }
    }
  };

  /**
   * Handle folder expand/collapse
   */
  const handleFolderExpand = async (nodeId: string) => {
    const node = findTreeNode(folderTree, nodeId);
    if (!node) return;

    if (node.isExpanded) {
      // Collapse
      setFolderTree((prev) =>
        updateTreeNode(prev, nodeId, (n) => ({
          ...n,
          isExpanded: false,
        }))
      );
    } else {
      // Expand - load children if not loaded
      if (!node.hasLoadedChildren) {
        await loadFolderChildren(nodeId);
      } else {
        setFolderTree((prev) =>
          updateTreeNode(prev, nodeId, (n) => ({
            ...n,
            isExpanded: true,
          }))
        );
      }
    }
  };

  // Handle sync for email
  const handleEmailSync = async () => {
    setSyncing(true);
    setError(null);

    try {
      let job: SyncJobDto;

      // If using a saved configuration, run it directly
      if (selectedConfigId) {
        job = await fetchJson<SyncJobDto>(
          `${apiBase}/api/data-source-integrations/${integrationId}/sync-configurations/${selectedConfigId}/run`,
          { method: 'POST' }
        );
      } else {
        // Use inline options
        const options: SyncOptions = {
          limit,
          incrementalOnly,
          filters: Object.keys(filters).length > 0 ? filters : undefined,
        };

        job = await fetchJson<SyncJobDto, SyncOptions>(
          `${apiBase}/api/data-source-integrations/${integrationId}/sync`,
          {
            method: 'POST',
            body: options,
          }
        );
      }

      setSyncJob(job);
      setStep('complete');

      if (onSyncStarted) {
        onSyncStarted(job);
      }

      // Legacy callback for backwards compatibility
      if (onSuccess) {
        onSuccess({
          totalImported: job.successfulItems,
          totalFailed: job.failedItems,
          totalSkipped: job.skippedItems,
          documentIds: job.documentIds,
          errors: [],
        });
      }
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to start sync');
      setStep('configure');
    } finally {
      setSyncing(false);
    }
  };

  // Handle sync for Drive
  const handleDriveSync = async () => {
    setSyncing(true);
    setError(null);

    try {
      let job: SyncJobDto;

      // If using a saved configuration, run it directly
      if (selectedConfigId) {
        job = await fetchJson<SyncJobDto>(
          `${apiBase}/api/data-source-integrations/${integrationId}/sync-configurations/${selectedConfigId}/run`,
          { method: 'POST' }
        );
      } else {
        // Use stored folder refs directly - no tree traversal needed
        // This fixes the bug where lazy-loaded folders weren't found in the tree
        const selectedFolders = Array.from(selectedFolderRefs.values());
        const excludedFolders = Array.from(excludedFolderRefs.values());

        const options: SyncOptions = {
          limit: driveLimit,
          selectedFolders:
            selectedFolders.length > 0 ? selectedFolders : undefined,
          excludedFolders:
            excludedFolders.length > 0 ? excludedFolders : undefined,
        };

        job = await fetchJson<SyncJobDto, SyncOptions>(
          `${apiBase}/api/data-source-integrations/${integrationId}/sync`,
          {
            method: 'POST',
            body: options,
          }
        );
      }

      setSyncJob(job);
      setStep('complete');

      if (onSyncStarted) {
        onSyncStarted(job);
      }

      // Legacy callback for backwards compatibility
      if (onSuccess) {
        onSuccess({
          totalImported: job.successfulItems,
          totalFailed: job.failedItems,
          totalSkipped: job.skippedItems,
          documentIds: job.documentIds,
          errors: [],
        });
      }
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to start sync');
      setStep('configure');
    } finally {
      setSyncing(false);
    }
  };

  // Handle sync for ClickUp
  const handleClickUpSync = async () => {
    setSyncing(true);
    setError(null);

    try {
      let job: SyncJobDto;

      // If using a saved configuration, run it directly
      if (selectedConfigId) {
        job = await fetchJson<SyncJobDto>(
          `${apiBase}/api/data-source-integrations/${integrationId}/sync-configurations/${selectedConfigId}/run`,
          { method: 'POST' }
        );
      } else {
        const selectedSpaces = Array.from(selectedSpaceRefs.values()).map(
          (space) => ({
            id: space.id,
            name: space.name,
          })
        );

        const options: SyncOptions = {
          limit: clickUpLimit,
          selectedFolders:
            selectedSpaces.length > 0 ? selectedSpaces : undefined,
        };

        job = await fetchJson<SyncJobDto, SyncOptions>(
          `${apiBase}/api/data-source-integrations/${integrationId}/sync`,
          {
            method: 'POST',
            body: options,
          }
        );
      }

      setSyncJob(job);
      setStep('complete');

      if (onSyncStarted) {
        onSyncStarted(job);
      }

      // Legacy callback for backwards compatibility
      if (onSuccess) {
        onSuccess({
          totalImported: job.successfulItems,
          totalFailed: job.failedItems,
          totalSkipped: job.skippedItems,
          documentIds: job.documentIds,
          errors: [],
        });
      }
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to start sync');
      setStep('configure');
    } finally {
      setSyncing(false);
    }
  };

  const handleStartSync = isDrive
    ? handleDriveSync
    : isClickUp
    ? handleClickUpSync
    : handleEmailSync;

  const handleFilterChange = (key: keyof EmailFilters, value: string) => {
    setFilters((prev) => {
      const updated = { ...prev };
      if (value) {
        updated[key] = value as any;
      } else {
        delete updated[key];
      }
      return updated;
    });
  };

  const selectAllFolders = () => {
    const refsMap = new Map<string, FolderRef>();
    folderTree.forEach((f) => refsMap.set(f.id, { id: f.id, name: f.name }));
    setSelectedFolderRefs(refsMap);
    setExcludedFolderRefs(new Map());
  };

  const deselectAllFolders = () => {
    setSelectedFolderRefs(new Map());
    setExcludedFolderRefs(new Map());
  };

  const getStepTitle = () => {
    switch (step) {
      case 'configure':
        return `Sync ${integrationName}`;
      case 'progress':
        return 'Syncing...';
      case 'complete':
        return 'Sync Complete';
    }
  };

  const formatNumber = (num: number) => {
    return num.toLocaleString();
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  };

  const handleClose = () => {
    if (!syncing) {
      onClose();
    }
  };

  // Calculate total estimated file count
  const getTotalEstimatedCount = (): number => {
    let total = 0;
    for (const folderId of selectedFolderRefs.keys()) {
      const count = folderCounts.get(folderId);
      if (count !== undefined) {
        total += count;
      }
    }
    return total;
  };

  // ---------- Render Functions ----------

  /**
   * Render the saved configuration selector
   * Shows at the top of each config UI when saved configs exist
   */
  const renderConfigurationSelector = () => {
    if (loadingConfigs) {
      return (
        <div className="mb-4 p-3 bg-base-200 rounded-lg">
          <div className="flex items-center gap-2">
            <Spinner size="xs" />
            <span className="text-sm text-base-content/70">
              Loading saved configurations...
            </span>
          </div>
        </div>
      );
    }

    if (savedConfigs.length === 0) {
      // No saved configs - show create prompt
      return (
        <div className="mb-4 p-3 bg-base-200 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm text-base-content/70">
              No saved configurations
            </span>
            {onManageConfigurations && (
              <button
                className="btn btn-xs btn-ghost"
                onClick={onManageConfigurations}
              >
                <Icon icon="lucide--plus" className="w-3 h-3 mr-1" />
                Create
              </button>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="mb-4 p-3 bg-base-200 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <label className="label-text font-medium">
            Use saved configuration
          </label>
          {onManageConfigurations && (
            <button
              className="btn btn-xs btn-ghost"
              onClick={onManageConfigurations}
            >
              <Icon icon="lucide--settings" className="w-3 h-3 mr-1" />
              Manage
            </button>
          )}
        </div>
        <select
          className="select select-bordered select-sm w-full"
          value={selectedConfigId || ''}
          onChange={(e) => handleConfigSelect(e.target.value || null)}
        >
          <option value="">Custom settings</option>
          {savedConfigs.map((config) => (
            <option key={config.id} value={config.id}>
              {config.name}
              {config.isDefault ? ' (default)' : ''}
            </option>
          ))}
        </select>
        {selectedConfigId && (
          <p className="text-xs text-base-content/60 mt-2">
            <Icon icon="lucide--info" className="w-3 h-3 inline mr-1" />
            Using saved configuration. Settings below are read-only.
          </p>
        )}
      </div>
    );
  };

  /**
   * Render a single folder tree item
   */
  const renderFolderTreeItem = (node: FolderTreeNode, depth: number = 0) => {
    const checkboxState = getCheckboxState(node.id);
    const hasChildren = node.children.length > 0 || !node.hasLoadedChildren;

    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-2 py-2 px-3 hover:bg-base-300 cursor-pointer border-b border-base-300/50"
          style={{ paddingLeft: `${12 + depth * 24}px` }}
        >
          {/* Expand/Collapse Button */}
          <button
            className="btn btn-ghost btn-xs btn-square"
            onClick={(e) => {
              e.stopPropagation();
              handleFolderExpand(node.id);
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
            onChange={() => handleFolderToggle(node.id)}
            className="checkbox checkbox-primary checkbox-sm"
          />

          {/* Folder Icon */}
          <Icon
            icon={node.isSharedDrive ? 'lucide--users' : 'lucide--folder'}
            className="w-5 h-5 text-base-content/70 flex-shrink-0"
          />

          {/* Folder Name */}
          <span
            className="flex-1 truncate"
            onClick={() => handleFolderToggle(node.id)}
          >
            {node.name}
          </span>

          {/* File Count */}
          {checkboxState !== 'unchecked' && (
            <div className="flex items-center gap-2">
              {node.isCountLoading ? (
                <Spinner size="xs" />
              ) : node.fileCount !== undefined ? (
                <span
                  className={`text-xs ${
                    node.fileCount > 1000
                      ? 'text-warning font-medium'
                      : 'text-base-content/60'
                  }`}
                >
                  ~{formatNumber(node.fileCount)} files
                </span>
              ) : (
                <button
                  className="btn btn-ghost btn-xs text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    fetchFolderCount(node.id);
                  }}
                >
                  <Icon icon="lucide--calculator" className="w-3 h-3 mr-1" />
                  Count
                </button>
              )}
            </div>
          )}
        </div>

        {/* Children */}
        {node.isExpanded && node.children.length > 0 && (
          <div>
            {node.children.map((child) =>
              renderFolderTreeItem(child, depth + 1)
            )}
          </div>
        )}
      </div>
    );
  };

  // Render Drive configuration UI
  const renderDriveConfig = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
          <span className="ml-3">Loading folders...</span>
        </div>
      );
    }

    const totalCount = getTotalEstimatedCount();
    const showWarning = totalCount > 1000;
    const isUsingConfig = !!selectedConfigId;

    return (
      <div className="flex flex-col h-full">
        {/* Configuration Selector */}
        <div className="flex-shrink-0">{renderConfigurationSelector()}</div>

        {/* Header with controls - hidden when using saved config */}
        {!isUsingConfig && (
          <div className="flex justify-between items-center mb-3 flex-shrink-0">
            <label className="label-text font-medium">
              Select folders to sync
            </label>
            <div className="space-x-2">
              <button
                className="btn btn-xs btn-ghost"
                onClick={selectAllFolders}
              >
                Select All
              </button>
              <button
                className="btn btn-xs btn-ghost"
                onClick={deselectAllFolders}
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Folder Tree - hidden when using saved config */}
        {!isUsingConfig && (
          <>
            {folderTree.length === 0 ? (
              <div className="text-center py-8 text-base-content/70 flex-shrink-0">
                <Icon
                  icon="lucide--folder-open"
                  className="w-12 h-12 mx-auto mb-2 opacity-50"
                />
                <p>No folders found in your Drive</p>
                <p className="text-sm">Files in root will still be synced</p>
              </div>
            ) : (
              <div className="bg-base-200 rounded-lg flex-1 overflow-y-auto min-h-0 mb-4">
                {folderTree.map((node) => renderFolderTreeItem(node))}
              </div>
            )}

            {/* Selection Summary */}
            <div className="flex-shrink-0 space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-base-content/70">
                  {selectedFolderRefs.size === 0
                    ? 'All files in your Drive will be synced'
                    : `${selectedFolderRefs.size} folder(s) selected`}
                  {excludedFolderRefs.size > 0 &&
                    ` (${excludedFolderRefs.size} excluded)`}
                </span>
                {totalCount > 0 && (
                  <span
                    className={`font-medium ${
                      showWarning ? 'text-warning' : ''
                    }`}
                  >
                    ~{formatNumber(totalCount)} files
                  </span>
                )}
              </div>

              {/* Warning for large selections */}
              {showWarning && (
                <div className="alert alert-warning py-2">
                  <Icon icon="lucide--alert-triangle" className="w-5 h-5" />
                  <span>
                    Large selection (~{formatNumber(totalCount)} files).
                    Consider selecting fewer folders or using the limit setting.
                  </span>
                </div>
              )}

              {/* Sync Options */}
              <div className="divider my-2">Sync Options</div>

              {/* Limit */}
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text">Maximum files to sync</span>
                  <span className="label-text-alt">{driveLimit} files</span>
                </label>
                <input
                  type="range"
                  min="10"
                  max="1000"
                  step="10"
                  value={driveLimit}
                  onChange={(e) => setDriveLimit(parseInt(e.target.value))}
                  className="range range-primary range-sm"
                />
                <div className="flex justify-between text-xs px-2 mt-1">
                  <span>10</span>
                  <span>250</span>
                  <span>500</span>
                  <span>1000</span>
                </div>
              </div>

              {/* Info */}
              <div className="alert alert-info py-2">
                <Icon icon="lucide--info" className="w-5 h-5" />
                <span>
                  Will sync up to <strong>{driveLimit}</strong> files
                  {selectedFolderRefs.size > 0
                    ? ` from ${selectedFolderRefs.size} selected folder(s)`
                    : ' from your entire Drive'}
                </span>
              </div>
            </div>
          </>
        )}

        {/* Show config summary when using saved config */}
        {isUsingConfig && (
          <div className="flex-shrink-0">
            {(() => {
              const config = savedConfigs.find(
                (c) => c.id === selectedConfigId
              );
              if (!config) return null;
              return (
                <div className="alert alert-info">
                  <Icon icon="lucide--info" className="w-5 h-5" />
                  <div>
                    <p>
                      Using configuration: <strong>{config.name}</strong>
                    </p>
                    <p className="text-xs opacity-70 mt-1">
                      Limit: {config.options.limit || 100} files
                      {config.options.incrementalOnly !== false &&
                        ' | Incremental only'}
                    </p>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    );
  };

  // Render Email configuration UI
  const renderEmailConfig = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
          <span className="ml-3">Loading statistics...</span>
        </div>
      );
    }

    if (!preview) {
      return null;
    }

    const isUsingConfig = !!selectedConfigId;

    return (
      <div className="space-y-6">
        {/* Configuration Selector */}
        {renderConfigurationSelector()}

        {/* Statistics Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="stat bg-base-200 rounded-lg p-4">
            <div className="stat-title text-xs">Total Emails</div>
            <div className="stat-value text-2xl">
              {formatNumber(preview.totalEmails)}
            </div>
            <div className="stat-desc">
              {formatNumber(preview.totalUnread)} unread
            </div>
          </div>
          <div className="stat bg-base-200 rounded-lg p-4">
            <div className="stat-title text-xs">Imported</div>
            <div className="stat-value text-2xl text-success">
              {formatNumber(preview.importedEmails)}
            </div>
            <div className="stat-desc">already synced</div>
          </div>
          <div className="stat bg-base-200 rounded-lg p-4">
            <div className="stat-title text-xs">Matching</div>
            <div className="stat-value text-2xl text-info">
              {formatNumber(preview.matchingEmails)}
            </div>
            <div className="stat-desc">match filters</div>
          </div>
          <div className="stat bg-base-200 rounded-lg p-4">
            <div className="stat-title text-xs">New</div>
            <div className="stat-value text-2xl text-warning">
              {formatNumber(preview.newEmails)}
            </div>
            <div className="stat-desc">available to sync</div>
          </div>
        </div>

        {/* Last Sync Info */}
        <div className="text-sm text-base-content/70">
          Last synced: {formatDate(preview.lastSyncedAt)}
        </div>

        {/* Folder Stats */}
        {preview.folders.length > 0 && (
          <div className="collapse collapse-arrow bg-base-200">
            <input type="checkbox" />
            <div className="collapse-title font-medium">
              Folders ({preview.folders.length})
            </div>
            <div className="collapse-content">
              <div className="space-y-2">
                {preview.folders.map((folder) => (
                  <div
                    key={folder.path}
                    className="flex justify-between items-center text-sm"
                  >
                    <span className="font-mono">
                      {folder.name || folder.path}
                    </span>
                    <span className="text-base-content/70">
                      {formatNumber(folder.totalMessages)} messages (
                      {formatNumber(folder.unreadMessages)} unread)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Sync Options - hidden when using saved config */}
        {!isUsingConfig && (
          <>
            <div className="divider">Sync Options</div>

            {/* Limit */}
            <div className="form-control">
              <label className="label">
                <span className="label-text">Maximum emails to sync</span>
                <span className="label-text-alt">{limit} emails</span>
              </label>
              <input
                type="range"
                min="10"
                max="500"
                step="10"
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value))}
                className="range range-primary"
              />
              <div className="flex justify-between text-xs px-2 mt-1">
                <span>10</span>
                <span>100</span>
                <span>250</span>
                <span>500</span>
              </div>
            </div>

            {/* Incremental Only */}
            <div className="form-control">
              <label className="label cursor-pointer">
                <div className="flex flex-col">
                  <span className="label-text">Incremental sync only</span>
                  <span className="label-text text-xs opacity-60">
                    {incrementalOnly
                      ? 'Only syncs emails received after last sync'
                      : 'Re-scans all emails (can re-import deleted items)'}
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={incrementalOnly}
                  onChange={(e) => setIncrementalOnly(e.target.checked)}
                  className="checkbox checkbox-primary"
                />
              </label>
            </div>

            {/* Filters Toggle */}
            <div className="form-control">
              <label className="label cursor-pointer">
                <span className="label-text">Apply filters</span>
                <input
                  type="checkbox"
                  checked={showFilters}
                  onChange={(e) => setShowFilters(e.target.checked)}
                  className="checkbox checkbox-secondary"
                />
              </label>
            </div>

            {/* Filter Options */}
            {showFilters && (
              <div className="bg-base-200 rounded-lg p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">From</span>
                    </label>
                    <input
                      type="text"
                      placeholder="sender@example.com"
                      value={filters.from || ''}
                      onChange={(e) =>
                        handleFilterChange('from', e.target.value)
                      }
                      className="input input-bordered input-sm"
                    />
                  </div>
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">To</span>
                    </label>
                    <input
                      type="text"
                      placeholder="recipient@example.com"
                      value={filters.to || ''}
                      onChange={(e) => handleFilterChange('to', e.target.value)}
                      className="input input-bordered input-sm"
                    />
                  </div>
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">Subject contains</span>
                    </label>
                    <input
                      type="text"
                      placeholder="keyword"
                      value={filters.subject || ''}
                      onChange={(e) =>
                        handleFilterChange('subject', e.target.value)
                      }
                      className="input input-bordered input-sm"
                    />
                  </div>
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">Body contains</span>
                    </label>
                    <input
                      type="text"
                      placeholder="keyword"
                      value={filters.text || ''}
                      onChange={(e) =>
                        handleFilterChange('text', e.target.value)
                      }
                      className="input input-bordered input-sm"
                    />
                  </div>
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">Since date</span>
                    </label>
                    <input
                      type="date"
                      value={filters.since || ''}
                      onChange={(e) =>
                        handleFilterChange('since', e.target.value)
                      }
                      className="input input-bordered input-sm"
                    />
                  </div>
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">Before date</span>
                    </label>
                    <input
                      type="date"
                      value={filters.before || ''}
                      onChange={(e) =>
                        handleFilterChange('before', e.target.value)
                      }
                      className="input input-bordered input-sm"
                    />
                  </div>
                </div>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={loadEmailPreview}
                >
                  <Icon icon="lucide--refresh-cw" className="w-4 h-4 mr-1" />
                  Refresh Preview
                </button>
              </div>
            )}

            {/* Summary */}
            <div className="alert alert-info">
              <Icon icon="lucide--info" className="w-5 h-5" />
              <span>
                Will sync up to{' '}
                <strong>{Math.min(limit, preview.newEmails)}</strong> emails
                {incrementalOnly && preview.lastSyncedAt
                  ? ` (new since ${formatDate(preview.lastSyncedAt)})`
                  : ''}
              </span>
            </div>
          </>
        )}

        {/* Show config summary when using saved config */}
        {isUsingConfig && (
          <>
            {(() => {
              const config = savedConfigs.find(
                (c) => c.id === selectedConfigId
              );
              if (!config) return null;
              return (
                <div className="alert alert-info">
                  <Icon icon="lucide--info" className="w-5 h-5" />
                  <div>
                    <p>
                      Will sync up to{' '}
                      <strong>
                        {Math.min(
                          config.options.limit || 100,
                          preview.newEmails
                        )}
                      </strong>{' '}
                      emails using configuration: <strong>{config.name}</strong>
                    </p>
                    <p className="text-xs opacity-70 mt-1">
                      {config.options.incrementalOnly !== false
                        ? 'Incremental only'
                        : 'Full rescan'}
                    </p>
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </div>
    );
  };

  // Render ClickUp configuration UI
  const renderClickUpConfig = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
          <span className="ml-3">Loading ClickUp spaces...</span>
        </div>
      );
    }

    const totalSelectedDocs = Array.from(selectedSpaceRefs.values()).reduce(
      (sum, space) => sum + (space.docCount || 0),
      0
    );
    const isUsingConfig = !!selectedConfigId;

    // Helper functions for ClickUp space selection
    const handleSpaceToggle = (space: SpaceRef) => {
      setSelectedSpaceRefs((prev) => {
        const next = new Map(prev);
        if (next.has(space.id)) {
          next.delete(space.id);
        } else {
          next.set(space.id, space);
        }
        return next;
      });
    };

    const selectAllSpaces = () => {
      const refsMap = new Map<string, SpaceRef>();
      clickUpSpaces.forEach((s) => refsMap.set(s.id, s));
      setSelectedSpaceRefs(refsMap);
    };

    const deselectAllSpaces = () => {
      setSelectedSpaceRefs(new Map());
    };

    return (
      <div className="flex flex-col h-full">
        {/* Configuration Selector */}
        <div className="flex-shrink-0">{renderConfigurationSelector()}</div>

        {/* Workspace Info */}
        {clickUpWorkspace && (
          <div className="alert alert-info mb-4 flex-shrink-0">
            <Icon icon="simple-icons--clickup" className="w-5 h-5" />
            <span>
              Workspace: <strong>{clickUpWorkspace.name}</strong>
            </span>
          </div>
        )}

        {/* Content hidden when using saved config */}
        {!isUsingConfig && (
          <>
            {/* Header with controls */}
            <div className="flex justify-between items-center mb-3 flex-shrink-0">
              <label className="label-text font-medium">
                Select spaces to sync docs from
              </label>
              <div className="space-x-2">
                <button
                  className="btn btn-xs btn-ghost"
                  onClick={selectAllSpaces}
                >
                  Select All
                </button>
                <button
                  className="btn btn-xs btn-ghost"
                  onClick={deselectAllSpaces}
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Space List */}
            {clickUpSpaces.length === 0 ? (
              <div className="text-center py-8 text-base-content/70 flex-shrink-0">
                <Icon
                  icon="lucide--folder-open"
                  className="w-12 h-12 mx-auto mb-2 opacity-50"
                />
                <p>No spaces found in this workspace</p>
              </div>
            ) : (
              <div className="bg-base-200 rounded-lg flex-1 overflow-y-auto min-h-0 mb-4">
                {clickUpSpaces.map((space) => (
                  <div
                    key={space.id}
                    className="flex items-center gap-3 py-3 px-4 hover:bg-base-300 cursor-pointer border-b border-base-300/50"
                    onClick={() => handleSpaceToggle(space)}
                  >
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={selectedSpaceRefs.has(space.id)}
                      onChange={() => handleSpaceToggle(space)}
                      className="checkbox checkbox-primary checkbox-sm"
                      onClick={(e) => e.stopPropagation()}
                    />

                    {/* Space Icon */}
                    <Icon
                      icon="lucide--folder"
                      className="w-5 h-5 text-base-content/70 flex-shrink-0"
                    />

                    {/* Space Name */}
                    <span className="flex-1 truncate">{space.name}</span>

                    {/* Doc Count */}
                    {selectedSpaceRefs.has(space.id) && (
                      <div className="flex items-center gap-2">
                        {loadingSpaceCounts.has(space.id) ? (
                          <Spinner size="xs" />
                        ) : space.docCount !== undefined ? (
                          <span className="text-xs text-base-content/60">
                            {space.docCount} docs
                          </span>
                        ) : (
                          <button
                            className="btn btn-ghost btn-xs text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              loadSpaceDocCount(space.id);
                            }}
                          >
                            <Icon
                              icon="lucide--calculator"
                              className="w-3 h-3 mr-1"
                            />
                            Count
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Selection Summary */}
            <div className="flex-shrink-0 space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-base-content/70">
                  {selectedSpaceRefs.size === 0
                    ? 'All spaces will be synced'
                    : `${selectedSpaceRefs.size} space(s) selected`}
                </span>
                {totalSelectedDocs > 0 && (
                  <span className="font-medium">~{totalSelectedDocs} docs</span>
                )}
              </div>

              {/* Sync Options */}
              <div className="divider my-2">Sync Options</div>

              {/* Limit */}
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text">Maximum docs to sync</span>
                  <span className="label-text-alt">{clickUpLimit} docs</span>
                </label>
                <input
                  type="range"
                  min="10"
                  max="500"
                  step="10"
                  value={clickUpLimit}
                  onChange={(e) => setClickUpLimit(parseInt(e.target.value))}
                  className="range range-primary range-sm"
                />
                <div className="flex justify-between text-xs px-2 mt-1">
                  <span>10</span>
                  <span>100</span>
                  <span>250</span>
                  <span>500</span>
                </div>
              </div>

              {/* Info */}
              <div className="alert alert-info py-2">
                <Icon icon="lucide--info" className="w-5 h-5" />
                <span>
                  Will sync up to <strong>{clickUpLimit}</strong> docs
                  {selectedSpaceRefs.size > 0
                    ? ` from ${selectedSpaceRefs.size} selected space(s)`
                    : ' from all spaces'}
                </span>
              </div>
            </div>
          </>
        )}

        {/* Show config summary when using saved config */}
        {isUsingConfig && (
          <div className="flex-shrink-0">
            {(() => {
              const config = savedConfigs.find(
                (c) => c.id === selectedConfigId
              );
              if (!config) return null;
              return (
                <div className="alert alert-info">
                  <Icon icon="lucide--info" className="w-5 h-5" />
                  <div>
                    <p>
                      Using configuration: <strong>{config.name}</strong>
                    </p>
                    <p className="text-xs opacity-70 mt-1">
                      Limit: {config.options.limit || 100} docs
                      {config.options.incrementalOnly !== false &&
                        ' | Incremental only'}
                    </p>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    );
  };

  // Render the modal content based on current step
  const renderContent = () => {
    if (step === 'configure') {
      if (isDrive) {
        return renderDriveConfig();
      } else if (isClickUp) {
        return renderClickUpConfig();
      } else {
        return renderEmailConfig();
      }
    }

    if (step === 'progress') {
      return (
        <div className="flex flex-col items-center justify-center py-12">
          <Spinner size="lg" />
          <p className="mt-4 text-lg">Starting sync...</p>
          <p className="mt-2 text-base-content/70">
            Please wait while we initialize the sync job.
          </p>
        </div>
      );
    }

    if (step === 'complete' && syncJob) {
      return (
        <div className="space-y-4">
          {/* Success Icon */}
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center">
              <Icon icon="lucide--rocket" className="w-10 h-10 text-success" />
            </div>
          </div>

          {/* Message */}
          <div className="text-center">
            <h3 className="text-xl font-bold mb-2">Sync Started!</h3>
            <p className="text-base-content/70">
              Your sync is now running in the background. You can close this
              modal and check the progress on the integration detail page.
            </p>
          </div>

          {/* Job Info */}
          <div className="bg-base-200 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-base-content/70">Job ID</span>
              <span className="font-mono text-xs">
                {syncJob.id.slice(0, 8)}...
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-base-content/70">Status</span>
              <span className="badge badge-info badge-sm">
                {syncJob.status}
              </span>
            </div>
            {syncJob.statusMessage && (
              <div className="flex justify-between text-sm">
                <span className="text-base-content/70">Message</span>
                <span>{syncJob.statusMessage}</span>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="alert alert-info">
            <Icon icon="lucide--info" className="w-5 h-5" />
            <span>
              The sync will continue in the background even if you navigate
              away. Check the integration details page for progress updates.
            </span>
          </div>
        </div>
      );
    }

    return null;
  };

  // Build actions based on current step
  const getActions = () => {
    if (step === 'configure') {
      const canSync = isDrive
        ? !loading
        : isClickUp
        ? !loading && clickUpSpaces.length > 0
        : !loading && preview && preview.newEmails > 0;

      if (isDrive) {
        // Three-button layout for Drive
        return [
          {
            label: 'Cancel',
            variant: 'ghost' as const,
            onClick: handleClose,
          },
          {
            label: configSaved ? 'Saved!' : 'Save Configuration',
            variant: 'secondary' as const,
            icon: configSaved ? 'lucide--check' : 'lucide--save',
            disabled: savingConfig || selectedFolderRefs.size === 0,
            onClick: saveConfiguration,
          },
          {
            label: 'Start Sync',
            variant: 'primary' as const,
            icon: 'lucide--download',
            disabled: !canSync || syncing,
            onClick: handleStartSync,
            autoFocus: true,
          },
        ];
      }

      if (isClickUp) {
        // Two-button layout for ClickUp (no save config for now)
        return [
          {
            label: 'Cancel',
            variant: 'ghost' as const,
            onClick: handleClose,
          },
          {
            label: 'Start Sync',
            variant: 'primary' as const,
            icon: 'lucide--download',
            disabled: !canSync || syncing,
            onClick: handleStartSync,
            autoFocus: true,
          },
        ];
      }

      // Two-button layout for email
      return [
        {
          label: 'Cancel',
          variant: 'ghost' as const,
          onClick: handleClose,
        },
        {
          label: 'Start Sync',
          variant: 'primary' as const,
          icon: 'lucide--download',
          disabled: !canSync,
          onClick: handleStartSync,
          autoFocus: true,
        },
      ];
    }

    if (step === 'progress') {
      return []; // No actions during sync
    }

    if (step === 'complete') {
      return [
        {
          label: 'Done',
          variant: 'primary' as const,
          onClick: handleClose,
          autoFocus: true,
        },
      ];
    }

    return [];
  };

  // Determine modal size based on source type
  const useWideModal = isDrive || isClickUp;
  const modalSizeClass = useWideModal ? 'max-w-3xl w-[95vw]' : 'max-w-2xl';
  const modalClassName = useWideModal
    ? '!max-h-[85vh] h-[85vh] flex flex-col'
    : '';

  return (
    <Modal
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !syncing) {
          onClose();
        }
      }}
      title={getStepTitle()}
      sizeClassName={modalSizeClass}
      className={modalClassName}
      actions={getActions()}
      hideCloseButton={syncing}
    >
      {/* Error message */}
      {error && (
        <div className="alert alert-error mb-4 flex-shrink-0">
          <Icon icon="lucide--alert-circle" className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      <div
        className={
          (isDrive || isClickUp) && step === 'configure'
            ? 'flex-1 min-h-0 overflow-hidden'
            : ''
        }
      >
        {renderContent()}
      </div>
    </Modal>
  );
}
