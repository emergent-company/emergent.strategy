/**
 * Unified DataTable Component
 *
 * A flexible, reusable table component with:
 * - Row selection and bulk actions
 * - Search and filtering
 * - Sorting
 * - View toggle (table/cards)
 * - Loading and empty states
 * - Custom row actions
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Dropdown } from '@/components/molecules/Dropdown';
import type {
  TableDataItem,
  DataTableProps,
  FilterConfig,
  SortConfig,
  SelectionMode,
  SelectionContext,
  PaginationConfig,
} from './types';

export function DataTable<T extends TableDataItem>({
  data,
  columns,
  loading = false,
  error = null,
  enableSelection = false,
  enableSearch = true,
  searchPlaceholder = 'Search...',
  getSearchText,
  filters = [],
  bulkActions = [],
  rowActions = [],
  useDropdownActions = false,
  enableViewToggle = false,
  defaultView = 'table',
  renderCard,
  onRowClick,
  onSelectionChange,
  onSearch,
  emptyMessage = 'No data available.',
  emptyIcon = 'lucide--inbox',
  noResultsMessage = 'No items match current filters.',
  formatDate,
  enableExport = false,
  onExport,
  toolbarActions,
  totalCount,
  className = '',
  disabled = false,
  pagination,
  onPageChange,
  paginationItemLabel = 'items',
}: DataTableProps<T>) {
  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<Map<string, string[]>>(
    new Map()
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('page');
  const [view, setView] = useState<'table' | 'cards'>(defaultView);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const dropdownRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Handle click outside dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openDropdown) {
        const ref = dropdownRefs.current.get(openDropdown);
        if (ref && !ref.contains(event.target as Node)) {
          setOpenDropdown(null);
        }
      }
    };

    if (openDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [openDropdown]);

  // Debounce search
  useEffect(() => {
    if (onSearch) {
      const timeoutId = setTimeout(() => {
        onSearch(searchQuery);
      }, 300);
      return () => clearTimeout(timeoutId);
    }
  }, [searchQuery, onSearch]);

  // Filter and search data
  const filteredData = useMemo(() => {
    let result = [...data];

    // Apply filters
    activeFilters.forEach((values, filterKey) => {
      if (values.length > 0) {
        const filter = filters.find((f) => f.key === filterKey);
        if (filter) {
          result = result.filter((item) => {
            const itemValue = filter.getValue(item);
            if (Array.isArray(itemValue)) {
              return values.some((v) => itemValue.includes(v));
            }
            return values.includes(itemValue);
          });
        }
      }
    });

    // Apply search
    if (searchQuery && getSearchText) {
      const query = searchQuery.toLowerCase();
      result = result.filter((item) =>
        getSearchText(item).toLowerCase().includes(query)
      );
    }

    // Apply sorting
    if (sortConfig) {
      result.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        if (aValue === bValue) return 0;

        const comparison = aValue < bValue ? -1 : 1;
        return sortConfig.direction === 'asc' ? comparison : -comparison;
      });
    }

    return result;
  }, [data, activeFilters, searchQuery, getSearchText, sortConfig, filters]);

  // Calculate filter counts
  const filtersWithCounts = useMemo(() => {
    return filters.map((filter) => ({
      ...filter,
      options: filter.options.map((option) => ({
        ...option,
        count: data.filter((item) => {
          const value = filter.getValue(item);
          if (Array.isArray(value)) {
            return value.includes(option.value);
          }
          return value === option.value;
        }).length,
      })),
    }));
  }, [data, filters]);

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = new Set(filteredData.map((item) => item.id));
      setSelectedIds(allIds);
      setSelectionMode('page'); // Reset to page mode when selecting via checkbox
      onSelectionChange?.(Array.from(allIds), filteredData);
    } else {
      setSelectedIds(new Set());
      setSelectionMode('page');
      onSelectionChange?.([], []);
    }
  };

  const handleSelectAllFromDatabase = () => {
    // Select all visible items and set mode to 'all'
    const allIds = new Set(filteredData.map((item) => item.id));
    setSelectedIds(allIds);
    setSelectionMode('all');
    onSelectionChange?.(Array.from(allIds), filteredData);
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
    setSelectionMode('page');
    onSelectionChange?.([], []);
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedIds(newSelected);
    setSelectionMode('page'); // Reset to page mode when manually selecting

    const selectedItems = filteredData.filter((item) =>
      newSelected.has(item.id)
    );
    onSelectionChange?.(Array.from(newSelected), selectedItems);
  };

  // Filter handlers
  const handleToggleFilter = (filterKey: string, value: string) => {
    const newFilters = new Map(activeFilters);
    const currentValues = newFilters.get(filterKey) || [];

    if (currentValues.includes(value)) {
      const updated = currentValues.filter((v) => v !== value);
      if (updated.length > 0) {
        newFilters.set(filterKey, updated);
      } else {
        newFilters.delete(filterKey);
      }
    } else {
      newFilters.set(filterKey, [...currentValues, value]);
    }

    setActiveFilters(newFilters);
  };

  const handleClearFilter = (filterKey: string) => {
    const newFilters = new Map(activeFilters);
    newFilters.delete(filterKey);
    setActiveFilters(newFilters);
  };

  const handleClearAllFilters = () => {
    setActiveFilters(new Map());
  };

  // Sort handler
  const handleSort = (key: string) => {
    setSortConfig((current) => {
      if (current?.key === key) {
        if (current.direction === 'asc') {
          return { key, direction: 'desc' };
        }
        return null; // Clear sort
      }
      return { key, direction: 'asc' };
    });
  };

  // Selection state
  const allSelected =
    filteredData.length > 0 &&
    filteredData.every((item) => selectedIds.has(item.id));
  const someSelected = filteredData.some((item) => selectedIds.has(item.id));
  const selectedItems = filteredData.filter((item) => selectedIds.has(item.id));

  // Check if toolbar should be rendered
  const hasToolbarContent =
    enableSearch ||
    filtersWithCounts.length > 0 ||
    toolbarActions ||
    (enableViewToggle && renderCard) ||
    enableExport;

  // Render toolbar
  const renderToolbar = () => {
    if (!hasToolbarContent) return null;

    return (
      <div className="flex flex-wrap items-center gap-3 bg-base-200/50 p-3 border border-base-content/5 rounded-box">
        {/* Search */}
        {enableSearch && (
          <label className="input input-sm min-w-64">
            <Icon icon="lucide--search" className="opacity-50 size-4" />
            <input
              type="search"
              placeholder={searchPlaceholder}
              className="grow"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </label>
        )}

        <div className="flex flex-wrap items-center gap-3 ml-auto">
          {/* Filter Dropdowns */}
          {filtersWithCounts.map((filter) => {
            const activeValues = activeFilters.get(filter.key) || [];
            const isActive = activeValues.length > 0;

            return (
              <div
                key={filter.key}
                className={`dropdown ${
                  openDropdown === filter.key ? 'dropdown-open' : ''
                }`}
                ref={(el) => {
                  if (el) dropdownRefs.current.set(filter.key, el);
                }}
              >
                <label
                  tabIndex={0}
                  className={`gap-2 btn btn-sm ${
                    isActive
                      ? `btn-${filter.badgeColor || 'primary'}`
                      : 'btn-ghost'
                  }`}
                  onClick={(e) => {
                    e.preventDefault();
                    setOpenDropdown(
                      openDropdown === filter.key ? null : filter.key
                    );
                  }}
                >
                  {filter.icon && (
                    <Icon icon={filter.icon} className="size-4" />
                  )}
                  {isActive ? (
                    <span>
                      {filter.label} ({activeValues.length})
                    </span>
                  ) : (
                    <span>{filter.label}</span>
                  )}
                </label>
                <ul
                  tabIndex={0}
                  className="dropdown-content menu bg-base-100 rounded-box z-1 w-64 p-2 shadow-sm max-h-80 overflow-y-auto"
                >
                  {isActive && (
                    <li className="mb-2">
                      <button
                        className="btn-block justify-between btn btn-xs btn-ghost"
                        onClick={() => handleClearFilter(filter.key)}
                      >
                        <span className="opacity-70 text-xs">Clear filter</span>
                        <Icon icon="lucide--x" className="size-3" />
                      </button>
                    </li>
                  )}

                  {filter.options.map((option) => (
                    <li key={option.value}>
                      <label className="flex justify-between items-center gap-2 cursor-pointer">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            className={`checkbox checkbox-sm checkbox-${
                              filter.badgeColor || 'primary'
                            }`}
                            checked={activeValues.includes(option.value)}
                            onChange={() =>
                              handleToggleFilter(filter.key, option.value)
                            }
                          />
                          <span className="font-medium">{option.label}</span>
                        </div>
                        <span className="badge badge-sm badge-ghost">
                          {option.count || 0}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}

          {/* Toolbar Actions */}
          {toolbarActions}

          {/* View Toggle */}
          {enableViewToggle && renderCard && (
            <div className="flex gap-1 join">
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
          )}

          {/* Export Button */}
          {enableExport && (
            <button
              className="btn btn-sm btn-ghost"
              title="Export"
              aria-label="Export data"
              onClick={() => onExport?.(filteredData)}
            >
              <Icon icon="lucide--download" className="size-4" />
            </button>
          )}
        </div>
      </div>
    );
  };

  // Render active filter badges
  const renderActiveFilters = () => {
    if (activeFilters.size === 0) return null;

    return (
      <div className="flex flex-wrap items-center gap-2 bg-base-200/30 px-3 py-2 border border-base-content/5 rounded-box">
        <span className="font-medium text-xs text-base-content/60">
          Active filters:
        </span>

        {Array.from(activeFilters.entries()).map(([filterKey, values]) => {
          const filter = filters.find((f) => f.key === filterKey);
          if (!filter) return null;

          return values.map((value) => {
            const option = filter.options.find((o) => o.value === value);
            return (
              <button
                key={`${filterKey}-${value}`}
                className={`gap-1 badge badge-${
                  filter.badgeColor || 'primary'
                } badge-sm`}
                onClick={() => handleToggleFilter(filterKey, value)}
                title={`Remove ${option?.label || value} filter`}
              >
                <span>{option?.label || value}</span>
                <Icon icon="lucide--x" className="size-3" />
              </button>
            );
          });
        })}

        <button
          className="ml-auto text-xs text-base-content/60 hover:text-base-content underline"
          onClick={handleClearAllFilters}
        >
          Clear all
        </button>
      </div>
    );
  };

  // Render bulk actions bar
  const renderBulkActions = () => {
    if (selectedIds.size === 0 || bulkActions.length === 0) return null;

    // Determine display count based on selection mode
    const displayCount =
      selectionMode === 'all' && totalCount ? totalCount : selectedIds.size;
    const showSelectAllOption =
      totalCount &&
      totalCount > filteredData.length &&
      selectionMode === 'page' &&
      allSelected;

    const handleBulkAction = async (action: (typeof bulkActions)[0]) => {
      const context: SelectionContext<T> = {
        selectedIds: Array.from(selectedIds),
        selectedItems: selectedItems,
        mode: selectionMode,
        totalCount: selectionMode === 'all' ? totalCount : selectedIds.size,
      };

      // Support both old and new action handlers
      if (action.onActionWithContext) {
        await action.onActionWithContext(context);
      } else if (action.onAction) {
        await action.onAction(Array.from(selectedIds), selectedItems);
      }

      // Clear selection after action
      handleClearSelection();
    };

    return (
      <div className="flex flex-wrap items-center gap-4 bg-primary/10 p-3 border border-primary/30 rounded">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">
            {selectionMode === 'all' && totalCount ? (
              <>All {totalCount.toLocaleString()} items selected</>
            ) : (
              <>{selectedIds.size} selected</>
            )}
          </span>

          {/* Show "Select all X items" option when all visible items are selected */}
          {showSelectAllOption && (
            <button
              className="text-sm text-primary hover:underline font-medium"
              onClick={handleSelectAllFromDatabase}
            >
              Select all {totalCount.toLocaleString()} items
            </button>
          )}

          {/* Show "Clear selection" when in 'all' mode */}
          {selectionMode === 'all' && (
            <button
              className="text-sm text-base-content/60 hover:text-base-content underline"
              onClick={handleClearSelection}
            >
              Clear selection
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {bulkActions.map((action) => {
            const variant = action.variant || 'primary';
            const style = action.style || 'filled';
            const btnClass =
              style === 'outline'
                ? `btn-outline btn-${variant}`
                : `btn-${variant}`;

            return (
              <button
                key={action.key}
                className={`gap-2 btn btn-sm ${btnClass}`}
                onClick={() => handleBulkAction(action)}
              >
                {action.icon && <Icon icon={action.icon} className="size-4" />}
                {action.label}
                {selectionMode === 'all' && totalCount && (
                  <span className="opacity-70">
                    ({totalCount.toLocaleString()})
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // Render table view
  const renderTableView = () => (
    <div className="overflow-x-auto rounded-box border border-base-content/5 bg-base-100">
      <table className="table">
        <thead>
          <tr className="text-xs text-base-content/60 uppercase bg-base-200/50">
            {enableSelection && (
              <th className="w-8 py-3">
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm"
                  checked={allSelected}
                  ref={(input) => {
                    if (input)
                      input.indeterminate = someSelected && !allSelected;
                  }}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                />
              </th>
            )}
            {columns.map((col) => (
              <th
                key={col.key}
                className={`py-3 ${col.width || ''} ${
                  col.headerClassName || ''
                } ${col.sortable ? 'cursor-pointer hover:bg-base-200' : ''}`}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
              >
                <div className="flex items-center gap-2">
                  {col.label}
                  {col.sortable && sortConfig?.key === col.key && (
                    <Icon
                      icon={
                        sortConfig.direction === 'asc'
                          ? 'lucide--arrow-up'
                          : 'lucide--arrow-down'
                      }
                      className="size-3"
                    />
                  )}
                </div>
              </th>
            ))}
            {rowActions.length > 0 && <th className="w-32 py-3">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={`skeleton-${i}`} className="opacity-70 animate-pulse">
                {enableSelection && (
                  <td className="py-2">
                    <div className="bg-base-300 rounded w-4 h-4" />
                  </td>
                )}
                {columns.map((col, j) => (
                  <td key={`skeleton-${i}-${j}`}>
                    <div className="bg-base-300 rounded w-full h-4" />
                  </td>
                ))}
                {rowActions.length > 0 && (
                  <td>
                    <div className="bg-base-300 rounded w-20 h-4" />
                  </td>
                )}
              </tr>
            ))}
          {!loading && error && (
            <tr>
              <td
                colSpan={
                  columns.length +
                  (enableSelection ? 1 : 0) +
                  (rowActions.length > 0 ? 1 : 0)
                }
                className="py-10 text-error text-sm text-center"
              >
                <Icon
                  icon="lucide--alert-circle"
                  className="mx-auto mb-2 size-5"
                />
                <div>{error}</div>
              </td>
            </tr>
          )}
          {!loading && !error && filteredData.length === 0 && (
            <tr>
              <td
                colSpan={
                  columns.length +
                  (enableSelection ? 1 : 0) +
                  (rowActions.length > 0 ? 1 : 0)
                }
                className="py-10 text-sm text-base-content/70 text-center"
              >
                <Icon
                  icon={emptyIcon}
                  className="opacity-50 mx-auto mb-2 size-8"
                />
                <div>
                  {activeFilters.size > 0 || searchQuery
                    ? noResultsMessage
                    : emptyMessage}
                </div>
              </td>
            </tr>
          )}
          {!loading &&
            !error &&
            filteredData.map((item) => (
              <tr
                key={item.id}
                className={`hover:bg-base-200/50 ${
                  onRowClick ? 'cursor-pointer' : ''
                } ${selectedIds.has(item.id) ? 'bg-base-200' : ''}`}
                onClick={() => onRowClick?.(item)}
              >
                {enableSelection && (
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm"
                      checked={selectedIds.has(item.id)}
                      onChange={(e) =>
                        handleSelectOne(item.id, e.target.checked)
                      }
                    />
                  </td>
                )}
                {columns.map((col) => (
                  <td key={col.key} className={col.cellClassName || ''}>
                    {col.render ? col.render(item) : item[col.key] ?? '—'}
                  </td>
                ))}
                {rowActions.length > 0 && (
                  <td
                    onClick={(e) => e.stopPropagation()}
                    className="relative overflow-visible"
                  >
                    {useDropdownActions ? (
                      <Dropdown end>
                        <Dropdown.Trigger
                          asButton
                          variant="ghost"
                          size="xs"
                          className="gap-1"
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        >
                          Actions
                          <Icon
                            icon="lucide--chevron-down"
                            className="size-3"
                          />
                        </Dropdown.Trigger>
                        <Dropdown.Menu width="w-52">
                          {rowActions
                            .filter((action) => !action.hidden?.(item))
                            .map((action, idx) => {
                              if (action.asLink && action.href) {
                                return (
                                  <Dropdown.Item
                                    key={idx}
                                    asLink
                                    href={action.href(item)}
                                  >
                                    {action.icon && (
                                      <Icon
                                        icon={action.icon}
                                        className="size-4"
                                      />
                                    )}
                                    {action.label}
                                  </Dropdown.Item>
                                );
                              }

                              return (
                                <Dropdown.Item
                                  key={idx}
                                  onClick={() => {
                                    action.onAction(item);
                                  }}
                                >
                                  {action.icon && (
                                    <Icon
                                      icon={action.icon}
                                      className="size-4"
                                    />
                                  )}
                                  {action.label}
                                </Dropdown.Item>
                              );
                            })}
                        </Dropdown.Menu>
                      </Dropdown>
                    ) : (
                      <div className="flex items-center gap-2">
                        {rowActions
                          .filter((action) => !action.hidden?.(item))
                          .map((action, idx) => {
                            const variant = action.variant || 'ghost';
                            const size = action.size || 'xs';

                            if (action.asLink && action.href) {
                              return (
                                <a
                                  key={idx}
                                  href={action.href(item)}
                                  className={`gap-1 btn btn-${size} btn-${variant}`}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {action.icon && (
                                    <Icon
                                      icon={action.icon}
                                      className="size-4"
                                    />
                                  )}
                                  {action.label}
                                </a>
                              );
                            }

                            return (
                              <button
                                key={idx}
                                className={`gap-1 btn btn-${size} btn-${variant}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  action.onAction(item);
                                }}
                              >
                                {action.icon && (
                                  <Icon icon={action.icon} className="size-4" />
                                )}
                                {action.label}
                              </button>
                            );
                          })}
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );

  // Render card view
  const renderCardView = () => {
    if (!renderCard) return null;

    return (
      <div className="gap-4 grid md:grid-cols-2 lg:grid-cols-3">
        {loading &&
          Array.from({ length: 6 }).map((_, i) => (
            <div
              key={`skeleton-${i}`}
              className="bg-base-100 p-4 border border-base-content/5 rounded-box animate-pulse"
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
        {!loading && !error && filteredData.length === 0 && (
          <div className="col-span-full py-10 text-sm text-base-content/70 text-center">
            <Icon
              icon={emptyIcon}
              className="opacity-50 mx-auto mb-3 size-12"
            />
            <div>
              {activeFilters.size > 0 || searchQuery
                ? noResultsMessage
                : emptyMessage}
            </div>
          </div>
        )}
        {!loading &&
          !error &&
          filteredData.map((item) =>
            renderCard(item, selectedIds.has(item.id), (checked) =>
              handleSelectOne(item.id, checked)
            )
          )}
      </div>
    );
  };

  // Render pagination
  const renderPagination = () => {
    // Don't show pagination if not provided, loading, has error, no data, or only 1 page
    if (
      !pagination ||
      loading ||
      error ||
      data.length === 0 ||
      pagination.totalPages <= 1
    ) {
      return null;
    }

    const { page, totalPages, total, limit, hasPrev, hasNext } = pagination;
    const startItem = (page - 1) * limit + 1;
    const endItem = Math.min(page * limit, total);

    return (
      <div className="flex justify-between items-center mt-4">
        <div className="text-sm text-base-content/70">
          Showing {startItem} - {endItem} of {total} {paginationItemLabel}
        </div>
        <div className="join">
          <button
            className="join-item btn btn-sm"
            onClick={() => onPageChange?.(page - 1)}
            disabled={!hasPrev}
          >
            «
          </button>
          <button className="join-item btn btn-sm">
            Page {page} of {totalPages}
          </button>
          <button
            className="join-item btn btn-sm"
            onClick={() => onPageChange?.(page + 1)}
            disabled={!hasNext}
          >
            »
          </button>
        </div>
      </div>
    );
  };

  return (
    <div
      className={`space-y-3 ${className} ${
        disabled ? 'opacity-60 pointer-events-none' : ''
      }`}
    >
      {renderToolbar()}
      {renderActiveFilters()}
      {renderBulkActions()}
      {view === 'table' ? renderTableView() : renderCardView()}
      {renderPagination()}
    </div>
  );
}

export default DataTable;
