/**
 * Unified DataTable Component - Type Definitions
 *
 * A flexible, reusable table component for displaying and managing data
 * with features like search, filtering, sorting, bulk actions, and row selection.
 */

import { ReactNode } from 'react';

/**
 * Base interface that all table data items must extend
 */
export interface TableDataItem {
  id: string;
  [key: string]: any;
}

/**
 * Column definition for table display
 */
export interface ColumnDef<T extends TableDataItem> {
  /** Unique identifier for the column */
  key: string;
  /** Display header text */
  label: string;
  /** Column width class (e.g., 'w-48', 'w-auto') */
  width?: string;
  /** Whether this column is sortable */
  sortable?: boolean;
  /** Custom render function for cell content */
  render?: (item: T) => ReactNode;
  /** CSS classes for the header */
  headerClassName?: string;
  /** CSS classes for the cell */
  cellClassName?: string;
}

/**
 * Filter configuration for dropdown filters
 */
export interface FilterConfig<T extends TableDataItem> {
  /** Unique identifier */
  key: string;
  /** Display label */
  label: string;
  /** Icon name (Iconify format) */
  icon?: string;
  /** Available filter options */
  options: FilterOption[];
  /** Function to extract filter value from data item */
  getValue: (item: T) => string | string[];
  /** Color variant for active filter badge */
  badgeColor?:
    | 'primary'
    | 'secondary'
    | 'accent'
    | 'info'
    | 'success'
    | 'warning'
    | 'error';
}

/**
 * Individual filter option
 */
export interface FilterOption {
  /** Option value */
  value: string;
  /** Display label */
  label: string;
  /** Count of items with this value (auto-calculated) */
  count?: number;
}

/**
 * Bulk action configuration
 */
export interface BulkAction<T extends TableDataItem> {
  /** Unique identifier */
  key: string;
  /** Display label */
  label: string;
  /** Icon name (Iconify format) */
  icon?: string;
  /** Button variant */
  variant?:
    | 'primary'
    | 'secondary'
    | 'accent'
    | 'success'
    | 'warning'
    | 'error'
    | 'ghost';
  /** Button style (filled or outline) */
  style?: 'filled' | 'outline';
  /** Action handler - receives selected item IDs */
  onAction: (selectedIds: string[], selectedItems: T[]) => void | Promise<void>;
}

/**
 * Row action configuration
 */
export interface RowAction<T extends TableDataItem> {
  /** Display label */
  label: string;
  /** Icon name (Iconify format) */
  icon?: string;
  /** Button variant */
  variant?:
    | 'primary'
    | 'secondary'
    | 'accent'
    | 'success'
    | 'warning'
    | 'error'
    | 'ghost';
  /** Button size */
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Action handler - receives the item */
  onAction: (item: T) => void | Promise<void>;
  /** Whether this action should appear as a link */
  asLink?: boolean;
  /** Link destination (if asLink is true) */
  href?: (item: T) => string;
  /** Function to determine if action should be hidden for a specific item */
  hidden?: (item: T) => boolean;
}

/**
 * Main DataTable component props
 */
export interface DataTableProps<T extends TableDataItem> {
  /** Array of data items to display */
  data: T[];

  /** Column definitions */
  columns: ColumnDef<T>[];

  /** Loading state */
  loading?: boolean;

  /** Error message */
  error?: string | null;

  /** Enable row selection checkboxes */
  enableSelection?: boolean;

  /** Enable search functionality */
  enableSearch?: boolean;

  /** Search placeholder text */
  searchPlaceholder?: string;

  /** Function to extract searchable text from item */
  getSearchText?: (item: T) => string;

  /** Callback for server-side search */
  onSearch?: (query: string) => void;

  /** Filter configurations */
  filters?: FilterConfig<T>[];

  /** Bulk actions (shown when rows selected) */
  bulkActions?: BulkAction<T>[];

  /** Row actions (shown per row) */
  rowActions?: RowAction<T>[];

  /** Enable view toggle (table/cards) */
  enableViewToggle?: boolean;

  /** Default view mode */
  defaultView?: 'table' | 'cards';

  /** Custom card renderer (if view toggle enabled) */
  renderCard?: (
    item: T,
    isSelected: boolean,
    onSelect: (checked: boolean) => void
  ) => ReactNode;

  /** Callback when a row is clicked */
  onRowClick?: (item: T) => void;

  /** Callback when selection changes */
  onSelectionChange?: (selectedIds: string[], selectedItems: T[]) => void;

  /** Empty state message */
  emptyMessage?: string;

  /** Empty state icon */
  emptyIcon?: string;

  /** No results message (when filters applied) */
  noResultsMessage?: string;

  /** Date format function (for consistent date rendering) */
  formatDate?: (date: string | Date) => string;

  /** Enable export functionality */
  enableExport?: boolean;

  /** Export handler */
  onExport?: (items: T[]) => void;

  /** Additional toolbar actions */
  toolbarActions?: ReactNode;

  /** Render row actions as dropdown menu */
  useDropdownActions?: boolean;

  /** CSS class for table container */
  className?: string;
}

/**
 * Sort configuration
 */
export interface SortConfig {
  /** Column key to sort by */
  key: string;
  /** Sort direction */
  direction: 'asc' | 'desc';
}
