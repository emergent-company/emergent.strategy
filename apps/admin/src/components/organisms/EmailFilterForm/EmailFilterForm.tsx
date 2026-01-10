import { Icon } from '@/components/atoms/Icon';

/**
 * Email filter options for sync
 */
export interface EmailFilters {
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

export interface EmailFilterFormProps {
  /**
   * Current filter values
   */
  filters: EmailFilters;

  /**
   * Callback when filters change
   */
  onChange: (filters: EmailFilters) => void;

  /**
   * Whether the form is read-only
   */
  readonly?: boolean;

  /**
   * Whether to show folder filter
   */
  showFolderFilter?: boolean;

  /**
   * Available folders for filtering
   */
  availableFolders?: string[];

  /**
   * Whether the form is collapsed by default
   */
  defaultCollapsed?: boolean;
}

/**
 * EmailFilterForm - Form for configuring email sync filters
 *
 * Supports filtering by:
 * - Sender (from)
 * - Recipient (to)
 * - Subject
 * - Body text
 * - Date range (since/before)
 * - Read/unread status
 * - Flagged status
 * - Folders (optional)
 */
export function EmailFilterForm({
  filters,
  onChange,
  readonly = false,
  showFolderFilter = false,
  availableFolders = [],
  defaultCollapsed = true,
}: EmailFilterFormProps) {
  const handleChange = (
    key: keyof EmailFilters,
    value: string | boolean | string[] | undefined
  ) => {
    const updated = { ...filters };
    if (value === '' || value === undefined) {
      delete updated[key];
    } else {
      (updated as any)[key] = value;
    }
    onChange(updated);
  };

  const hasActiveFilters = Object.keys(filters).length > 0;

  const clearAllFilters = () => {
    onChange({});
  };

  if (readonly && !hasActiveFilters) {
    return (
      <div className="text-sm text-base-content/60 italic">
        No filters applied
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon icon="lucide--filter" className="w-4 h-4" />
          <span className="font-medium">Email Filters</span>
          {hasActiveFilters && (
            <span className="badge badge-primary badge-sm">
              {Object.keys(filters).length} active
            </span>
          )}
        </div>
        {!readonly && hasActiveFilters && (
          <button
            type="button"
            className="btn btn-xs btn-ghost"
            onClick={clearAllFilters}
          >
            Clear All
          </button>
        )}
      </div>

      {/* Filter Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* From */}
        <div className="form-control">
          <label className="label">
            <span className="label-text">From</span>
          </label>
          <input
            type="text"
            placeholder="sender@example.com"
            value={filters.from || ''}
            onChange={(e) => handleChange('from', e.target.value)}
            className="input input-bordered input-sm"
            disabled={readonly}
          />
        </div>

        {/* To */}
        <div className="form-control">
          <label className="label">
            <span className="label-text">To</span>
          </label>
          <input
            type="text"
            placeholder="recipient@example.com"
            value={filters.to || ''}
            onChange={(e) => handleChange('to', e.target.value)}
            className="input input-bordered input-sm"
            disabled={readonly}
          />
        </div>

        {/* Subject */}
        <div className="form-control">
          <label className="label">
            <span className="label-text">Subject contains</span>
          </label>
          <input
            type="text"
            placeholder="Invoice, Report, etc."
            value={filters.subject || ''}
            onChange={(e) => handleChange('subject', e.target.value)}
            className="input input-bordered input-sm"
            disabled={readonly}
          />
        </div>

        {/* Body Text */}
        <div className="form-control">
          <label className="label">
            <span className="label-text">Body contains</span>
          </label>
          <input
            type="text"
            placeholder="Search text in body"
            value={filters.text || ''}
            onChange={(e) => handleChange('text', e.target.value)}
            className="input input-bordered input-sm"
            disabled={readonly}
          />
        </div>

        {/* Since Date */}
        <div className="form-control">
          <label className="label">
            <span className="label-text">Since</span>
          </label>
          <input
            type="date"
            value={filters.since || ''}
            onChange={(e) => handleChange('since', e.target.value)}
            className="input input-bordered input-sm"
            disabled={readonly}
          />
        </div>

        {/* Before Date */}
        <div className="form-control">
          <label className="label">
            <span className="label-text">Before</span>
          </label>
          <input
            type="date"
            value={filters.before || ''}
            onChange={(e) => handleChange('before', e.target.value)}
            className="input input-bordered input-sm"
            disabled={readonly}
          />
        </div>
      </div>

      {/* Status Filters */}
      <div className="flex flex-wrap gap-4">
        {/* Seen/Unread */}
        <div className="form-control">
          <label className="label cursor-pointer gap-2">
            <input
              type="checkbox"
              checked={filters.seen === false}
              onChange={(e) =>
                handleChange('seen', e.target.checked ? false : undefined)
              }
              className="checkbox checkbox-sm"
              disabled={readonly}
            />
            <span className="label-text">Unread only</span>
          </label>
        </div>

        {/* Flagged */}
        <div className="form-control">
          <label className="label cursor-pointer gap-2">
            <input
              type="checkbox"
              checked={filters.flagged === true}
              onChange={(e) =>
                handleChange('flagged', e.target.checked ? true : undefined)
              }
              className="checkbox checkbox-sm"
              disabled={readonly}
            />
            <span className="label-text">Flagged only</span>
          </label>
        </div>
      </div>

      {/* Folder Filter */}
      {showFolderFilter && availableFolders.length > 0 && (
        <div className="form-control">
          <label className="label">
            <span className="label-text">Folders</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {availableFolders.map((folder) => {
              const isSelected = filters.folders?.includes(folder);
              return (
                <button
                  key={folder}
                  type="button"
                  className={`btn btn-xs ${
                    isSelected ? 'btn-primary' : 'btn-outline'
                  }`}
                  onClick={() => {
                    if (readonly) return;
                    const current = filters.folders || [];
                    const updated = isSelected
                      ? current.filter((f) => f !== folder)
                      : [...current, folder];
                    handleChange(
                      'folders',
                      updated.length > 0 ? updated : undefined
                    );
                  }}
                  disabled={readonly}
                >
                  {folder}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Filters Summary (Read-only mode) */}
      {readonly && hasActiveFilters && (
        <div className="bg-base-200 rounded-lg p-3">
          <div className="text-xs text-base-content/70 space-y-1">
            {filters.from && <div>From: {filters.from}</div>}
            {filters.to && <div>To: {filters.to}</div>}
            {filters.subject && <div>Subject: {filters.subject}</div>}
            {filters.text && <div>Body: {filters.text}</div>}
            {filters.since && <div>Since: {filters.since}</div>}
            {filters.before && <div>Before: {filters.before}</div>}
            {filters.seen === false && <div>Unread only</div>}
            {filters.flagged === true && <div>Flagged only</div>}
            {filters.folders && filters.folders.length > 0 && (
              <div>Folders: {filters.folders.join(', ')}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
