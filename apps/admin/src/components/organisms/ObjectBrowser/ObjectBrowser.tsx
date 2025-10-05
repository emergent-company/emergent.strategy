import { useState } from 'react';
import { Icon } from '@/components/atoms/Icon';

export interface GraphObject {
    id: string;
    name: string;
    type: string;
    source?: string;
    updated_at: string;
    relationship_count?: number;
    properties?: Record<string, unknown>;
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
    /** Called when search query changes */
    onSearchChange?: (query: string) => void;
    /** Called when type filter changes */
    onTypeFilterChange?: (types: string[]) => void;
    /** Available object types for filtering */
    availableTypes?: string[];
}

export const ObjectBrowser: React.FC<ObjectBrowserProps> = ({
    objects = [],
    loading = false,
    error = null,
    onObjectClick,
    onBulkSelect,
    onSearchChange,
    onTypeFilterChange,
    availableTypes = [],
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [view, setView] = useState<'table' | 'cards'>('table');
    const [dropdownOpen, setDropdownOpen] = useState(false);

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const query = e.target.value;
        setSearchQuery(query);
        onSearchChange?.(query);
    };

    const handleTypeToggle = (type: string) => {
        const newTypes = selectedTypes.includes(type)
            ? selectedTypes.filter(t => t !== type)
            : [...selectedTypes, type];
        setSelectedTypes(newTypes);
        onTypeFilterChange?.(newTypes);
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            const allIds = new Set(objects.map(obj => obj.id));
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

    const filteredObjects = objects.filter(obj => {
        // Apply type filter
        if (selectedTypes.length > 0 && !selectedTypes.includes(obj.type)) {
            return false;
        }
        // Apply search filter
        if (searchQuery && !obj.name.toLowerCase().includes(searchQuery.toLowerCase())) {
            return false;
        }
        return true;
    });

    const allSelected = filteredObjects.length > 0 && filteredObjects.every(obj => selectedIds.has(obj.id));
    const someSelected = filteredObjects.some(obj => selectedIds.has(obj.id));

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
                <div className="dropdown" data-open={dropdownOpen}>
                    <button
                        tabIndex={0}
                        role="button"
                        className="btn btn-sm btn-ghost"
                        aria-label="Type filter"
                        onClick={() => setDropdownOpen(!dropdownOpen)}
                    >
                        <Icon icon="lucide--filter" className="size-4" />
                        Type {selectedTypes.length > 0 && `(${selectedTypes.length})`}
                    </button>
                    {dropdownOpen && (
                        <ul
                            tabIndex={0}
                            className="z-10 bg-base-100 shadow p-2 rounded-box w-52 dropdown-content menu"
                            onMouseDown={(e) => e.preventDefault()} // Prevent blur on click
                        >
                            {availableTypes.map(type => (
                                <li key={type}>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="checkbox checkbox-sm"
                                            checked={selectedTypes.includes(type)}
                                            onChange={() => handleTypeToggle(type)}
                                        />
                                        <span>{type}</span>
                                    </label>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            {/* View Toggle */}
            <div className="flex gap-1 ml-auto join">
                <button
                    className={`btn btn-sm join-item ${view === 'table' ? 'btn-active' : 'btn-ghost'}`}
                    onClick={() => setView('table')}
                    title="Table view"
                >
                    <Icon icon="lucide--table" className="size-4" />
                </button>
                <button
                    className={`btn btn-sm join-item ${view === 'cards' ? 'btn-active' : 'btn-ghost'}`}
                    onClick={() => setView('cards')}
                    title="Card view"
                >
                    <Icon icon="lucide--layout-grid" className="size-4" />
                </button>
            </div>

            {/* Export Button */}
            <button className="btn btn-sm btn-ghost" title="Export" aria-label="Export all objects">
                <Icon icon="lucide--download" className="size-4" />
            </button>
        </div>
    );

    const renderBulkActions = () => {
        if (selectedIds.size === 0) return null;
        return (
            <div className="flex items-center gap-4 bg-primary/10 p-3 border border-primary/30 rounded">
                <span className="font-medium text-sm">
                    {selectedIds.size} selected
                </span>
                <button className="gap-2 btn btn-sm btn-ghost">
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
                                ref={input => {
                                    if (input) input.indeterminate = someSelected && !allSelected;
                                }}
                                onChange={(e) => handleSelectAll(e.target.checked)}
                            />
                        </th>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Source</th>
                        <th>Updated</th>
                        <th>Rel</th>
                    </tr>
                </thead>
                <tbody>
                    {loading && (
                        Array.from({ length: 5 }).map((_, i) => (
                            <tr key={`skeleton-${i}`} className="opacity-70 animate-pulse">
                                <td className="py-2"><div className="bg-base-300 rounded w-4 h-4" /></td>
                                <td><div className="bg-base-300 rounded w-40 h-4" /></td>
                                <td><div className="bg-base-300 rounded w-24 h-4" /></td>
                                <td><div className="bg-base-300 rounded w-20 h-4" /></td>
                                <td><div className="bg-base-300 rounded w-16 h-4" /></td>
                                <td><div className="bg-base-300 rounded w-10 h-4" /></td>
                            </tr>
                        ))
                    )}
                    {!loading && error && (
                        <tr>
                            <td colSpan={6} className="py-10 text-error text-sm text-center">
                                <Icon icon="lucide--alert-circle" className="mx-auto mb-2 size-5" />
                                <div>{error}</div>
                            </td>
                        </tr>
                    )}
                    {!loading && !error && filteredObjects.length === 0 && (
                        <tr>
                            <td colSpan={6} className="py-10 text-sm text-base-content/70 text-center">
                                <Icon icon="lucide--inbox" className="opacity-50 mx-auto mb-2 size-8" />
                                <div>No objects match current filters.</div>
                            </td>
                        </tr>
                    )}
                    {!loading && !error && filteredObjects.map((obj) => (
                        <tr
                            key={obj.id}
                            className={`hover:bg-base-200/50 cursor-pointer ${selectedIds.has(obj.id) ? 'bg-base-200' : ''}`}
                            onClick={() => onObjectClick?.(obj)}
                        >
                            <td onClick={(e) => e.stopPropagation()}>
                                <input
                                    type="checkbox"
                                    className="checkbox checkbox-sm"
                                    checked={selectedIds.has(obj.id)}
                                    onChange={(e) => handleSelectOne(obj.id, e.target.checked)}
                                />
                            </td>
                            <td className="font-medium">{obj.name}</td>
                            <td>
                                <span className="badge badge-sm badge-ghost">{obj.type}</span>
                            </td>
                            <td className="text-sm text-base-content/70">{obj.source || '—'}</td>
                            <td className="text-sm text-base-content/70">
                                {new Date(obj.updated_at).toLocaleDateString()}
                            </td>
                            <td className="text-sm text-base-content/70">
                                {obj.relationship_count ?? '—'}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );

    const renderCardView = () => (
        <div className="gap-4 grid md:grid-cols-2 lg:grid-cols-3">
            {loading && (
                Array.from({ length: 6 }).map((_, i) => (
                    <div key={`skeleton-${i}`} className="bg-base-100 p-4 border border-base-300 rounded animate-pulse">
                        <div className="bg-base-300 mb-2 rounded w-3/4 h-5" />
                        <div className="bg-base-300 mb-3 rounded w-1/2 h-4" />
                        <div className="bg-base-300 rounded w-full h-3" />
                    </div>
                ))
            )}
            {!loading && error && (
                <div className="col-span-full py-10 text-error text-sm text-center">
                    <Icon icon="lucide--alert-circle" className="mx-auto mb-2 size-8" />
                    <div>{error}</div>
                </div>
            )}
            {!loading && !error && filteredObjects.length === 0 && (
                <div className="col-span-full py-10 text-sm text-base-content/70 text-center">
                    <Icon icon="lucide--inbox" className="opacity-50 mx-auto mb-3 size-12" />
                    <div>No objects match current filters.</div>
                </div>
            )}
            {!loading && !error && filteredObjects.map((obj) => (
                <div
                    key={obj.id}
                    className={`bg-base-100 border border-base-300 hover:border-primary/30 rounded p-4 cursor-pointer transition-colors ${selectedIds.has(obj.id) ? 'border-primary' : ''
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
                                    <span className="text-xs text-base-content/60">{obj.source}</span>
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
            {renderBulkActions()}
            {view === 'table' ? renderTableView() : renderCardView()}
        </div>
    );
};

export default ObjectBrowser;
