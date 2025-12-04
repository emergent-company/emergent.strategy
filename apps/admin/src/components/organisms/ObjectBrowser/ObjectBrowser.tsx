import { useState, useRef, useEffect } from 'react';
import { Icon } from '@/components/atoms/Icon';

export interface GraphObject {
  id: string;
  name: string;
  type: string;
  source?: string;
  status?: string;
  updated_at: string;
  relationship_count?: number;
  properties?: Record<string, unknown>;
  embedding?: any | null;
  embedding_updated_at?: string | null;
}

export interface ObjectBrowserProps {
  /** Array of objects to display */
  objects: GraphObject[];
  /** Loading state */
  loading?: boolean;
  /** Error message if failed to load */
  error?: string | null;
  /** Called when an object is clicked */
  onObjectClick?: (object: GraphObject) => void;
  /** Called when objects are selected for bulk action */
  onBulkSelect?: (selectedIds: string[]) => void;
  /** Called when bulk delete is requested */
  onBulkDelete?: (selectedIds: string[]) => void;
  /** Called when bulk accept is requested */
  onBulkAccept?: (selectedIds: string[]) => void;
  /** Called when search query changes */
  onSearchChange?: (query: string) => void;
  /** Called when type filter changes */
  onTypeFilterChange?: (types: string[]) => void;
  /** Available object types for filtering */
  availableTypes?: string[];
  /** Called when status filter changes */
  onStatusFilterChange?: (statuses: string[]) => void;
  /** Available statuses for filtering */
  availableStatuses?: string[];
  /** Called when tag filter changes */
  onTagFilterChange?: (tags: string[]) => void;
  /** Available tags for filtering */
  availableTags?: string[];
}

export const ObjectBrowser: React.FC<ObjectBrowserProps> = ({
  objects = [],
  loading = false,
  error = null,
  onObjectClick,
  onBulkSelect,
  onBulkDelete,
  onBulkAccept,
  onSearchChange,
  onTypeFilterChange,
  availableTypes = [],
  onStatusFilterChange,
  availableStatuses = [],
  onTagFilterChange,
  availableTags = [],
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [view, setView] = useState<'table' | 'cards'>('table');
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const typeDropdownRef = useRef<HTMLDivElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const tagDropdownRef = useRef<HTMLDivElement>(null);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    onSearchChange?.(query);
  };

  const handleTypeToggle = (type: string) => {
    const newTypes = selectedTypes.includes(type)
      ? selectedTypes.filter((t) => t !== type)
      : [...selectedTypes, type];
    setSelectedTypes(newTypes);
    onTypeFilterChange?.(newTypes);
  };

  const handleClearTypeFilter = () => {
    setSelectedTypes([]);
    onTypeFilterChange?.([]);
  };

  const handleStatusToggle = (status: string) => {
    const newStatuses = selectedStatuses.includes(status)
      ? selectedStatuses.filter((s) => s !== status)
      : [...selectedStatuses, status];
    setSelectedStatuses(newStatuses);
    onStatusFilterChange?.(newStatuses);
  };

  const handleClearStatusFilter = () => {
    setSelectedStatuses([]);
    onStatusFilterChange?.([]);
  };

  const handleTagToggle = (tag: string) => {
    const newTags = selectedTags.includes(tag)
      ? selectedTags.filter((t) => t !== tag)
      : [...selectedTags, tag];
    setSelectedTags(newTags);
    onTagFilterChange?.(newTags);
  };

  const handleClearTagFilter = () => {
    setSelectedTags([]);
    onTagFilterChange?.([]);
  };

  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        typeDropdownRef.current &&
        !typeDropdownRef.current.contains(event.target as Node)
      ) {
        setTypeDropdownOpen(false);
      }
      if (
        statusDropdownRef.current &&
        !statusDropdownRef.current.contains(event.target as Node)
      ) {
        setStatusDropdownOpen(false);
      }
      if (
        tagDropdownRef.current &&
        !tagDropdownRef.current.contains(event.target as Node)
      ) {
        setTagDropdownOpen(false);
      }
    };

    if (typeDropdownOpen || statusDropdownOpen || tagDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [typeDropdownOpen, statusDropdownOpen, tagDropdownOpen]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = new Set(objects.map((obj) => obj.id));
      setSelectedIds(allIds);
      onBulkSelect?.(Array.from(allIds));
    } else {
      setSelectedIds(new Set());
      onBulkSelect?.([]);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedIds(newSelected);
    onBulkSelect?.(Array.from(newSelected));
  };

  const filteredObjects = objects.filter((obj) => {
    // Apply type filter
    if (selectedTypes.length > 0 && !selectedTypes.includes(obj.type)) {
      return false;
    }

    // Apply status filter
    if (selectedStatuses.length > 0) {
      const objStatus = obj.status || '';
      if (!selectedStatuses.includes(objStatus)) {
        return false;
      }
    }

    // Apply tag filter
    if (selectedTags.length > 0) {
      const objTags = (obj.properties?.tags as string[] | undefined) || [];
      // Object must have at least one selected tag
      const hasMatchingTag = selectedTags.some((tag) => objTags.includes(tag));
      if (!hasMatchingTag) {
        return false;
      }
    }

    // Apply search filter
    if (
      searchQuery &&
      !obj.name.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const allSelected =
    filteredObjects.length > 0 &&
    filteredObjects.every((obj) => selectedIds.has(obj.id));
  const someSelected = filteredObjects.some((obj) => selectedIds.has(obj.id));

  const renderToolbar = () => (
    <div className="flex flex-wrap items-center gap-3 bg-base-200/50 p-3 border border-base-300 rounded">
      {/* Search */}
      <label className="flex items-center gap-2 min-w-64 input input-sm input-ghost">
        <Icon icon="lucide--search" className="opacity-70 size-4" />
        <input
          type="text"
          placeholder="Search objects..."
          className="grow"
          value={searchQuery}
          onChange={handleSearchChange}
        />
      </label>

      {/* Type Filter Dropdown */}
      {availableTypes.length > 0 && (
        <div
          className={`dropdown ${typeDropdownOpen ? 'dropdown-open' : ''}`}
          ref={typeDropdownRef}
        >
          <label
            tabIndex={0}
            className={`gap-2 btn btn-sm ${
              selectedTypes.length > 0 ? 'btn-primary' : 'btn-ghost'
            }`}
            onClick={(e) => {
              e.preventDefault();
              setTypeDropdownOpen(!typeDropdownOpen);
            }}
          >
            <Icon icon="lucide--filter" className="size-4" />
            {selectedTypes.length > 0 ? (
              <span>Type ({selectedTypes.length})</span>
            ) : (
              <span>Filter by Type</span>
            )}
          </label>
          <ul
            tabIndex={0}
            className="z-[1] bg-base-100 shadow-lg p-2 border border-base-300 rounded-box w-64 max-h-80 overflow-y-auto dropdown-content menu"
          >
            {/* Header with clear button */}
            {selectedTypes.length > 0 && (
              <li className="mb-2">
                <button
                  className="btn-block justify-between btn btn-xs btn-ghost"
                  onClick={handleClearTypeFilter}
                >
                  <span className="opacity-70 text-xs">Clear all filters</span>
                  <Icon icon="lucide--x" className="size-3" />
                </button>
              </li>
            )}

            {/* Type checkboxes */}
            {availableTypes.map((type) => {
              const count = objects.filter((obj) => obj.type === type).length;
              return (
                <li key={type}>
                  <label className="flex justify-between items-center gap-2 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm checkbox-primary"
                        checked={selectedTypes.includes(type)}
                        onChange={() => handleTypeToggle(type)}
                      />
                      <span className="font-medium">{type}</span>
                    </div>
                    <span className="badge badge-sm badge-ghost">{count}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Status Filter Dropdown */}
      {availableStatuses.length > 0 && (
        <div
          className={`dropdown ${statusDropdownOpen ? 'dropdown-open' : ''}`}
          ref={statusDropdownRef}
        >
          <label
            tabIndex={0}
            className={`gap-2 btn btn-sm ${
              selectedStatuses.length > 0 ? 'btn-accent' : 'btn-ghost'
            }`}
            onClick={(e) => {
              e.preventDefault();
              setStatusDropdownOpen(!statusDropdownOpen);
            }}
          >
            <Icon icon="lucide--circle-check" className="size-4" />
            {selectedStatuses.length > 0 ? (
              <span>Status ({selectedStatuses.length})</span>
            ) : (
              <span>Filter by Status</span>
            )}
          </label>
          <ul
            tabIndex={0}
            className="z-[1] bg-base-100 shadow-lg p-2 border border-base-300 rounded-box w-56 max-h-80 overflow-y-auto dropdown-content menu"
          >
            {/* Header with clear button */}
            {selectedStatuses.length > 0 && (
              <li className="mb-2">
                <button
                  className="btn-block justify-between btn btn-xs btn-ghost"
                  onClick={handleClearStatusFilter}
                >
                  <span className="opacity-70 text-xs">Clear all filters</span>
                  <Icon icon="lucide--x" className="size-3" />
                </button>
              </li>
            )}

            {/* Status checkboxes */}
            {availableStatuses.map((status) => {
              const count = objects.filter(
                (obj) => (obj.status || '') === status
              ).length;
              const statusColor =
                status === 'accepted'
                  ? 'checkbox-success'
                  : status === 'draft'
                  ? 'checkbox-warning'
                  : status === 'rejected'
                  ? 'checkbox-error'
                  : 'checkbox-accent';
              return (
                <li key={status}>
                  <label className="flex justify-between items-center gap-2 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className={`checkbox checkbox-sm ${statusColor}`}
                        checked={selectedStatuses.includes(status)}
                        onChange={() => handleStatusToggle(status)}
                      />
                      <span className="font-medium capitalize">{status}</span>
                    </div>
                    <span className="badge badge-sm badge-ghost">{count}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Tag Filter Dropdown */}
      {availableTags.length > 0 && (
        <div
          className={`dropdown ${tagDropdownOpen ? 'dropdown-open' : ''}`}
          ref={tagDropdownRef}
        >
          <label
            tabIndex={0}
            className={`gap-2 btn btn-sm ${
              selectedTags.length > 0 ? 'btn-secondary' : 'btn-ghost'
            }`}
            onClick={(e) => {
              e.preventDefault();
              setTagDropdownOpen(!tagDropdownOpen);
            }}
          >
            <Icon icon="lucide--tag" className="size-4" />
            {selectedTags.length > 0 ? (
              <span>Tags ({selectedTags.length})</span>
            ) : (
              <span>Filter by Tag</span>
            )}
          </label>
          <ul
            tabIndex={0}
            className="z-[1] bg-base-100 shadow-lg p-2 border border-base-300 rounded-box w-[32rem] max-h-[40rem] overflow-y-auto dropdown-content menu"
          >
            {/* Header with clear button */}
            {selectedTags.length > 0 && (
              <li className="mb-2">
                <button
                  className="btn-block justify-between btn btn-xs btn-ghost"
                  onClick={handleClearTagFilter}
                >
                  <span className="opacity-70 text-xs">Clear all tags</span>
                  <Icon icon="lucide--x" className="size-3" />
                </button>
              </li>
            )}

            {/* Tag checkboxes */}
            {availableTags.map((tag) => {
              const count = objects.filter((obj) => {
                const objTags =
                  (obj.properties?.tags as string[] | undefined) || [];
                return objTags.includes(tag);
              }).length;
              return (
                <li key={tag}>
                  <label className="flex justify-between items-center gap-2 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm checkbox-secondary"
                        checked={selectedTags.includes(tag)}
                        onChange={() => handleTagToggle(tag)}
                      />
                      <span className="font-medium">{tag}</span>
                    </div>
                    <span className="badge badge-sm badge-ghost">{count}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* View Toggle */}
      <div className="flex gap-1 ml-auto join">
        <button
          className={`btn btn-sm join-item ${
            view === 'table' ? 'btn-active' : 'btn-ghost'
          }`}
          onClick={() => setView('table')}
          title="Table view"
        >
          <Icon icon="lucide--table" className="size-4" />
        </button>
        <button
          className={`btn btn-sm join-item ${
            view === 'cards' ? 'btn-active' : 'btn-ghost'
          }`}
          onClick={() => setView('cards')}
          title="Card view"
        >
          <Icon icon="lucide--layout-grid" className="size-4" />
        </button>
      </div>

      {/* Export Button */}
      <button
        className="btn btn-sm btn-ghost"
        title="Export"
        aria-label="Export all objects"
      >
        <Icon icon="lucide--download" className="size-4" />
      </button>
    </div>
  );

  const renderActiveFilters = () => {
    if (
      selectedTypes.length === 0 &&
      selectedStatuses.length === 0 &&
      selectedTags.length === 0
    )
      return null;

    return (
      <div className="flex flex-wrap items-center gap-2 bg-base-200/30 px-3 py-2 border border-base-300 rounded">
        <span className="font-medium text-xs text-base-content/60">
          Active filters:
        </span>

        {/* Type filter badges */}
        {selectedTypes.map((type) => (
          <button
            key={`type-${type}`}
            className="gap-1 badge badge-primary badge-sm"
            onClick={() => handleTypeToggle(type)}
            title={`Remove ${type} filter`}
          >
            <span>{type}</span>
            <Icon icon="lucide--x" className="size-3" />
          </button>
        ))}

        {/* Status filter badges */}
        {selectedStatuses.map((status) => (
          <button
            key={`status-${status}`}
            className={`gap-1 badge badge-sm ${
              status === 'accepted'
                ? 'badge-success'
                : status === 'draft'
                ? 'badge-warning'
                : status === 'rejected'
                ? 'badge-error'
                : 'badge-accent'
            }`}
            onClick={() => handleStatusToggle(status)}
            title={`Remove ${status} filter`}
          >
            <span className="capitalize">{status}</span>
            <Icon icon="lucide--x" className="size-3" />
          </button>
        ))}

        {/* Tag filter badges */}
        {selectedTags.map((tag) => (
          <button
            key={`tag-${tag}`}
            className="gap-1 badge badge-secondary badge-sm"
            onClick={() => handleTagToggle(tag)}
            title={`Remove ${tag} tag filter`}
          >
            <span>{tag}</span>
            <Icon icon="lucide--x" className="size-3" />
          </button>
        ))}

        <button
          className="ml-auto text-xs text-base-content/60 hover:text-base-content underline"
          onClick={() => {
            handleClearTypeFilter();
            handleClearStatusFilter();
            handleClearTagFilter();
          }}
        >
          Clear all
        </button>
      </div>
    );
  };

  const renderBulkActions = () => {
    if (selectedIds.size === 0) return null;
    return (
      <div className="flex items-center gap-4 bg-primary/10 p-3 border border-primary/30 rounded">
        <span className="font-medium text-sm">{selectedIds.size} selected</span>
        <button
          className="gap-2 btn btn-sm btn-success"
          onClick={() => {
            if (onBulkAccept) {
              onBulkAccept(Array.from(selectedIds));
              setSelectedIds(new Set());
            }
          }}
        >
          <Icon icon="lucide--check-circle" className="size-4" />
          Accept
        </button>
        <button
          className="gap-2 btn-outline btn btn-sm btn-error"
          onClick={() => {
            if (onBulkDelete) {
              onBulkDelete(Array.from(selectedIds));
              setSelectedIds(new Set());
            }
          }}
        >
          <Icon icon="lucide--trash-2" className="size-4" />
          Delete
        </button>
        <button className="gap-2 btn btn-sm btn-ghost">
          <Icon icon="lucide--download" className="size-4" />
          Export
        </button>
        <button className="gap-2 btn btn-sm btn-ghost">
          <Icon icon="lucide--tag" className="size-4" />
          Add Label
        </button>
      </div>
    );
  };

  const renderTableView = () => (
    <div className="border border-base-300 rounded overflow-x-auto">
      <table className="table table-sm">
        <thead>
          <tr className="text-xs text-base-content/60 uppercase">
            <th className="w-8">
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={allSelected}
                ref={(input) => {
                  if (input) input.indeterminate = someSelected && !allSelected;
                }}
                onChange={(e) => handleSelectAll(e.target.checked)}
              />
            </th>
            <th>Name</th>
            <th>Type</th>
            <th>Status</th>
            <th>Source</th>
            <th>Confidence</th>
            <th>Updated</th>
            <th>Rel</th>
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={`skeleton-${i}`} className="opacity-70 animate-pulse">
                <td className="py-2">
                  <div className="bg-base-300 rounded w-4 h-4" />
                </td>
                <td>
                  <div className="bg-base-300 rounded w-40 h-4" />
                </td>
                <td>
                  <div className="bg-base-300 rounded w-24 h-4" />
                </td>
                <td>
                  <div className="bg-base-300 rounded w-16 h-4" />
                </td>
                <td>
                  <div className="bg-base-300 rounded w-20 h-4" />
                </td>
                <td>
                  <div className="bg-base-300 rounded w-16 h-4" />
                </td>
                <td>
                  <div className="bg-base-300 rounded w-16 h-4" />
                </td>
                <td>
                  <div className="bg-base-300 rounded w-10 h-4" />
                </td>
              </tr>
            ))}
          {!loading && error && (
            <tr>
              <td colSpan={8} className="py-10 text-error text-sm text-center">
                <Icon
                  icon="lucide--alert-circle"
                  className="mx-auto mb-2 size-5"
                />
                <div>{error}</div>
              </td>
            </tr>
          )}
          {!loading && !error && filteredObjects.length === 0 && (
            <tr>
              <td
                colSpan={8}
                className="py-10 text-sm text-base-content/70 text-center"
              >
                <Icon
                  icon="lucide--inbox"
                  className="opacity-50 mx-auto mb-2 size-8"
                />
                <div>No objects match current filters.</div>
              </td>
            </tr>
          )}
          {!loading &&
            !error &&
            filteredObjects.map((obj) => {
              const extractionConfidence = obj.properties
                ?._extraction_confidence as number | undefined;
              const hasExtractionData = extractionConfidence !== undefined;

              return (
                <tr
                  key={obj.id}
                  className={`hover:bg-base-200/50 cursor-pointer ${
                    selectedIds.has(obj.id) ? 'bg-base-200' : ''
                  }`}
                  onClick={() => onObjectClick?.(obj)}
                >
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm"
                      checked={selectedIds.has(obj.id)}
                      onChange={(e) =>
                        handleSelectOne(obj.id, e.target.checked)
                      }
                    />
                  </td>
                  <td className="font-medium">
                    {obj.name}
                    {hasExtractionData && (
                      <Icon
                        icon="lucide--sparkles"
                        className="inline-block ml-1 size-3 text-primary"
                        title="AI Extracted"
                      />
                    )}
                  </td>
                  <td>
                    <span className="badge badge-sm badge-ghost">
                      {obj.type}
                    </span>
                  </td>
                  <td>
                    {obj.status ? (
                      <span
                        className={`badge badge-sm ${
                          obj.status === 'accepted'
                            ? 'badge-success'
                            : obj.status === 'draft'
                            ? 'badge-warning'
                            : obj.status === 'rejected'
                            ? 'badge-error'
                            : 'badge-ghost'
                        }`}
                      >
                        {obj.status}
                      </span>
                    ) : (
                      <span className="text-sm text-base-content/70">—</span>
                    )}
                  </td>
                  <td className="text-sm text-base-content/70">
                    {obj.source || '—'}
                  </td>
                  <td>
                    {hasExtractionData ? (
                      <div className="flex items-center gap-1">
                        <span
                          className={`text-xs font-medium ${
                            extractionConfidence >= 0.8
                              ? 'text-success'
                              : extractionConfidence >= 0.6
                              ? 'text-warning'
                              : 'text-error'
                          }`}
                        >
                          {(extractionConfidence * 100).toFixed(0)}%
                        </span>
                        <div className="w-12">
                          <progress
                            className={`progress progress-xs ${
                              extractionConfidence >= 0.8
                                ? 'progress-success'
                                : extractionConfidence >= 0.6
                                ? 'progress-warning'
                                : 'progress-error'
                            }`}
                            value={extractionConfidence * 100}
                            max="100"
                          />
                        </div>
                      </div>
                    ) : (
                      <span className="text-sm text-base-content/70">—</span>
                    )}
                  </td>
                  <td className="text-sm text-base-content/70">
                    {new Date(obj.updated_at).toLocaleDateString()}
                  </td>
                  <td className="text-sm text-base-content/70">
                    {obj.relationship_count ?? '—'}
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );

  const renderCardView = () => (
    <div className="gap-4 grid md:grid-cols-2 lg:grid-cols-3">
      {loading &&
        Array.from({ length: 6 }).map((_, i) => (
          <div
            key={`skeleton-${i}`}
            className="bg-base-100 p-4 border border-base-300 rounded animate-pulse"
          >
            <div className="bg-base-300 mb-2 rounded w-3/4 h-5" />
            <div className="bg-base-300 mb-3 rounded w-1/2 h-4" />
            <div className="bg-base-300 rounded w-full h-3" />
          </div>
        ))}
      {!loading && error && (
        <div className="col-span-full py-10 text-error text-sm text-center">
          <Icon icon="lucide--alert-circle" className="mx-auto mb-2 size-8" />
          <div>{error}</div>
        </div>
      )}
      {!loading && !error && filteredObjects.length === 0 && (
        <div className="col-span-full py-10 text-sm text-base-content/70 text-center">
          <Icon
            icon="lucide--inbox"
            className="opacity-50 mx-auto mb-3 size-12"
          />
          <div>No objects match current filters.</div>
        </div>
      )}
      {!loading &&
        !error &&
        filteredObjects.map((obj) => (
          <div
            key={obj.id}
            className={`bg-base-100 border border-base-300 hover:border-primary/30 rounded p-4 cursor-pointer transition-colors ${
              selectedIds.has(obj.id) ? 'border-primary' : ''
            }`}
            onClick={() => onObjectClick?.(obj)}
          >
            <div className="flex items-start gap-3 mb-3">
              <input
                type="checkbox"
                className="mt-1 checkbox checkbox-sm"
                checked={selectedIds.has(obj.id)}
                onChange={(e) => {
                  e.stopPropagation();
                  handleSelectOne(obj.id, e.target.checked);
                }}
                onClick={(e) => e.stopPropagation()}
              />
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-base truncate">{obj.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="badge badge-sm badge-ghost">{obj.type}</span>
                  {obj.source && (
                    <span className="text-xs text-base-content/60">
                      {obj.source}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-base-content/60">
              <div className="flex items-center gap-1">
                <Icon icon="lucide--clock" className="size-3" />
                {new Date(obj.updated_at).toLocaleDateString()}
              </div>
              {obj.relationship_count !== undefined && (
                <div className="flex items-center gap-1">
                  <Icon icon="lucide--git-branch" className="size-3" />
                  {obj.relationship_count}
                </div>
              )}
            </div>
          </div>
        ))}
    </div>
  );

  return (
    <div className="space-y-3">
      {renderToolbar()}
      {renderActiveFilters()}
      {renderBulkActions()}
      {view === 'table' ? renderTableView() : renderCardView()}
    </div>
  );
};

export default ObjectBrowser;
