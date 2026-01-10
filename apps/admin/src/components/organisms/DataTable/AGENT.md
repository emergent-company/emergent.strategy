# DataTable Component - AI Agent Guide

## Quick Decision: DataTable vs Custom

| Use DataTable When                    | Use Custom Implementation When                        |
| ------------------------------------- | ----------------------------------------------------- |
| Standard CRUD list views              | Highly specialized layouts (kanban, timeline)         |
| Need search, filter, sort, pagination | Real-time data (websockets with frequent updates)     |
| Bulk operations on rows               | Complex cell interactions (inline editing, drag-drop) |
| Consistent UX across admin pages      | Non-tabular data display                              |

**Default choice**: Use DataTable unless you have a specific reason not to.

---

## Import

```tsx
import { DataTable, type ColumnDef } from '@/components/organisms/DataTable';
// Or import types separately:
import type {
  FilterConfig,
  BulkAction,
  RowAction,
  PaginationConfig,
} from '@/components/organisms/DataTable';
```

---

## Required Props

### 1. `data: T[]`

Array of items extending `TableDataItem` (must have `id: string`).

### 2. `columns: ColumnDef<T>[]`

Column definitions:

```tsx
interface ColumnDef<T> {
  key: string; // Unique identifier, also used for sorting
  label: string; // Header text
  width?: string; // Tailwind width class (e.g., 'w-48', 'w-auto')
  sortable?: boolean; // Enable column sorting
  render?: (item: T) => ReactNode; // Custom cell renderer
  headerClassName?: string;
  cellClassName?: string;
}
```

---

## Minimal Example

```tsx
interface User extends TableDataItem {
  id: string;
  name: string;
  email: string;
}

const columns: ColumnDef<User>[] = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
];

<DataTable<User> data={users} columns={columns} loading={isLoading} />;
```

---

## Feature Configuration

### Search

```tsx
// Client-side search (filters loaded data)
<DataTable
  enableSearch={true}                    // Default: true
  searchPlaceholder="Search users..."
  getSearchText={(user) => `${user.name} ${user.email}`}  // Required for client-side
/>

// Server-side search (triggers API call)
<DataTable
  enableSearch={true}
  onSearch={(query) => fetchUsers({ search: query })}  // Debounced 300ms
  // Don't provide getSearchText for server-side
/>
```

### Filters

```tsx
const filters: FilterConfig<User>[] = [
  {
    key: 'status',
    label: 'Status',
    icon: 'lucide--circle-dot', // Optional Iconify icon
    badgeColor: 'primary', // Badge color when active
    options: [
      { value: 'active', label: 'Active' },
      { value: 'inactive', label: 'Inactive' },
    ],
    getValue: (user) => user.status, // Extract value for filtering
  },
  {
    key: 'roles',
    label: 'Roles',
    options: [
      { value: 'admin', label: 'Admin' },
      { value: 'user', label: 'User' },
    ],
    getValue: (user) => user.roles, // Can return string[] for multi-value
  },
];

<DataTable filters={filters} />;
```

**Note**: Filter counts are auto-calculated from `data`. Options show `(count)` badges.

### Server-Side Pagination

```tsx
interface PaginationConfig {
  page: number; // Current page (1-indexed)
  totalPages: number;
  total: number; // Total items across all pages
  limit: number; // Items per page
  hasPrev: boolean;
  hasNext: boolean;
}

// In your component:
const [page, setPage] = useState(1);
const { data, pagination } = useApi(`/users?page=${page}&limit=20`);

<DataTable
  data={data}
  pagination={pagination}
  onPageChange={(newPage) => setPage(newPage)}
  paginationItemLabel="users" // "Showing 1-20 of 100 users"
/>;
```

### Row Selection & Bulk Actions

```tsx
const bulkActions: BulkAction<User>[] = [
  {
    key: 'delete',
    label: 'Delete',
    icon: 'lucide--trash-2',
    variant: 'error',
    style: 'outline', // 'filled' | 'outline'
    // Simple handler (page selection only)
    onAction: (selectedIds, selectedItems) => {
      deleteUsers(selectedIds);
    },
    // OR: Enhanced handler with "select all" support
    onActionWithContext: (context) => {
      if (context.mode === 'all') {
        // Delete ALL matching items in database
        deleteAllUsers();
      } else {
        // Delete only selected page items
        deleteUsers(context.selectedIds);
      }
    },
  },
];

<DataTable
  enableSelection={true}
  bulkActions={bulkActions}
  totalCount={totalFromServer} // Enables "Select all X items" option
  onSelectionChange={(ids, items) => console.log('Selected:', ids)}
/>;
```

**Selection modes**:

- `page`: Only visible/loaded items selected
- `all`: All items in database selected (requires `totalCount` prop)

### Row Actions

```tsx
const rowActions: RowAction<User>[] = [
  {
    label: 'Edit',
    icon: 'lucide--edit',
    variant: 'ghost',
    size: 'xs',
    onAction: (user) => navigate(`/users/${user.id}/edit`),
  },
  {
    label: 'View',
    icon: 'lucide--eye',
    asLink: true,
    href: (user) => `/users/${user.id}`,
  },
  {
    label: 'Delete',
    icon: 'lucide--trash-2',
    variant: 'error',
    hidden: (user) => user.role === 'admin',  // Conditionally hide
    onAction: (user) => deleteUser(user.id),
  },
];

// Inline buttons (default)
<DataTable rowActions={rowActions} />

// Dropdown menu (better for 3+ actions)
<DataTable rowActions={rowActions} useDropdownActions={true} />
```

### View Toggle (Table/Cards)

```tsx
<DataTable
  enableViewToggle={true}
  defaultView="table" // 'table' | 'cards'
  renderCard={(user, isSelected, onSelect) => (
    <div className={`card ${isSelected ? 'ring-2 ring-primary' : ''}`}>
      <input
        type="checkbox"
        checked={isSelected}
        onChange={(e) => onSelect(e.target.checked)}
      />
      <h3>{user.name}</h3>
      <p>{user.email}</p>
    </div>
  )}
/>
```

### Toolbar Customization

```tsx
<DataTable
  toolbarActions={
    <>
      <button className="btn btn-sm btn-primary">
        <Icon icon="lucide--plus" /> Add User
      </button>
      <button className="btn btn-sm btn-ghost">
        <Icon icon="lucide--download" /> Export
      </button>
    </>
  }
  enableExport={true}
  onExport={(filteredItems) => downloadCSV(filteredItems)}
/>
```

---

## Complete Example

```tsx
import { useState } from 'react';
import {
  DataTable,
  type ColumnDef,
  type FilterConfig,
  type BulkAction,
  type RowAction,
} from '@/components/organisms/DataTable';
import { useApi } from '@/hooks/use-api';

interface Project extends TableDataItem {
  id: string;
  name: string;
  status: 'active' | 'archived';
  owner: { name: string };
  createdAt: string;
}

export function ProjectsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const { data, pagination, isLoading, error, refetch } = useApi<{
    items: Project[];
    pagination: PaginationConfig;
  }>(`/projects?page=${page}&search=${search}&limit=20`);

  const columns: ColumnDef<Project>[] = [
    {
      key: 'name',
      label: 'Project',
      sortable: true,
      render: (p) => <span className="font-medium">{p.name}</span>,
    },
    {
      key: 'owner',
      label: 'Owner',
      render: (p) => p.owner.name,
    },
    {
      key: 'status',
      label: 'Status',
      render: (p) => (
        <span
          className={`badge badge-${
            p.status === 'active' ? 'success' : 'ghost'
          }`}
        >
          {p.status}
        </span>
      ),
    },
    {
      key: 'createdAt',
      label: 'Created',
      sortable: true,
      render: (p) => new Date(p.createdAt).toLocaleDateString(),
    },
  ];

  const filters: FilterConfig<Project>[] = [
    {
      key: 'status',
      label: 'Status',
      icon: 'lucide--circle-dot',
      badgeColor: 'success',
      options: [
        { value: 'active', label: 'Active' },
        { value: 'archived', label: 'Archived' },
      ],
      getValue: (p) => p.status,
    },
  ];

  const bulkActions: BulkAction<Project>[] = [
    {
      key: 'archive',
      label: 'Archive',
      icon: 'lucide--archive',
      variant: 'warning',
      onActionWithContext: async (ctx) => {
        if (ctx.mode === 'all') {
          await archiveAllProjects();
        } else {
          await archiveProjects(ctx.selectedIds);
        }
        refetch();
      },
    },
  ];

  const rowActions: RowAction<Project>[] = [
    {
      label: 'Edit',
      icon: 'lucide--edit',
      asLink: true,
      href: (p) => `/projects/${p.id}/edit`,
    },
    {
      label: 'Delete',
      icon: 'lucide--trash-2',
      variant: 'error',
      hidden: (p) => p.status === 'archived',
      onAction: async (p) => {
        if (confirm('Delete this project?')) {
          await deleteProject(p.id);
          refetch();
        }
      },
    },
  ];

  return (
    <DataTable<Project>
      data={data?.items ?? []}
      columns={columns}
      loading={isLoading}
      error={error?.message}
      // Search
      enableSearch={true}
      searchPlaceholder="Search projects..."
      onSearch={setSearch}
      // Filters
      filters={filters}
      // Pagination
      pagination={data?.pagination}
      onPageChange={setPage}
      paginationItemLabel="projects"
      // Selection & Actions
      enableSelection={true}
      bulkActions={bulkActions}
      rowActions={rowActions}
      useDropdownActions={true}
      totalCount={data?.pagination.total}
      // Empty states
      emptyMessage="No projects yet. Create your first project!"
      emptyIcon="lucide--folder"
      noResultsMessage="No projects match your filters."
    />
  );
}
```

---

## Props Reference

| Prop                  | Type                                        | Default                | Description                                    |
| --------------------- | ------------------------------------------- | ---------------------- | ---------------------------------------------- |
| `data`                | `T[]`                                       | **required**           | Array of items (must have `id: string`)        |
| `columns`             | `ColumnDef<T>[]`                            | **required**           | Column definitions                             |
| `loading`             | `boolean`                                   | `false`                | Show skeleton loading state                    |
| `error`               | `string \| null`                            | `null`                 | Error message to display                       |
| `enableSelection`     | `boolean`                                   | `false`                | Show row checkboxes                            |
| `enableSearch`        | `boolean`                                   | `true`                 | Show search input                              |
| `searchPlaceholder`   | `string`                                    | `'Search...'`          | Search input placeholder                       |
| `getSearchText`       | `(item: T) => string`                       | -                      | Extract searchable text (client-side)          |
| `onSearch`            | `(query: string) => void`                   | -                      | Server-side search callback (debounced 300ms)  |
| `filters`             | `FilterConfig<T>[]`                         | `[]`                   | Filter dropdown configurations                 |
| `bulkActions`         | `BulkAction<T>[]`                           | `[]`                   | Actions for selected rows                      |
| `rowActions`          | `RowAction<T>[]`                            | `[]`                   | Per-row action buttons                         |
| `useDropdownActions`  | `boolean`                                   | `false`                | Render row actions as dropdown                 |
| `enableViewToggle`    | `boolean`                                   | `false`                | Show table/cards toggle                        |
| `defaultView`         | `'table' \| 'cards'`                        | `'table'`              | Initial view mode                              |
| `renderCard`          | `(item, isSelected, onSelect) => ReactNode` | -                      | Card renderer for card view                    |
| `onRowClick`          | `(item: T) => void`                         | -                      | Row click handler                              |
| `onSelectionChange`   | `(ids: string[], items: T[]) => void`       | -                      | Selection change callback                      |
| `totalCount`          | `number`                                    | -                      | Total items (enables "select all X")           |
| `pagination`          | `PaginationConfig`                          | -                      | Server-side pagination state                   |
| `onPageChange`        | `(page: number) => void`                    | -                      | Page change callback                           |
| `paginationItemLabel` | `string`                                    | `'items'`              | Label in pagination text                       |
| `emptyMessage`        | `string`                                    | `'No data available.'` | Empty state message                            |
| `emptyIcon`           | `string`                                    | `'lucide--inbox'`      | Empty state icon                               |
| `noResultsMessage`    | `string`                                    | `'No items match...'`  | Filtered empty state                           |
| `enableExport`        | `boolean`                                   | `false`                | Show export button                             |
| `onExport`            | `(items: T[]) => void`                      | -                      | Export handler                                 |
| `toolbarActions`      | `ReactNode`                                 | -                      | Custom toolbar buttons                         |
| `className`           | `string`                                    | `''`                   | Container CSS class                            |
| `disabled`            | `boolean`                                   | `false`                | Disable interaction (opacity + pointer-events) |

---

## Common Patterns

### Loading with useApi hook

```tsx
const { data, isLoading, error } = useApi<User[]>('/users');

<DataTable data={data ?? []} loading={isLoading} error={error?.message} />;
```

### Refetch after mutation

```tsx
const { refetch } = useApi('/users');

const handleDelete = async (user: User) => {
  await deleteUser(user.id);
  refetch(); // Refresh table data
};
```

### Navigate on row click

```tsx
import { useNavigate } from 'react-router';

const navigate = useNavigate();

<DataTable onRowClick={(user) => navigate(`/users/${user.id}`)} />;
```

---

## Anti-Patterns

| Don't                                       | Do                                                                |
| ------------------------------------------- | ----------------------------------------------------------------- |
| `fetch()` directly in component             | Use `useApi` hook                                                 |
| Create custom table for standard lists      | Use DataTable                                                     |
| Mix client-side and server-side search      | Pick one approach                                                 |
| Provide both `getSearchText` and `onSearch` | Use `getSearchText` for client-side OR `onSearch` for server-side |
| Forget `totalCount` when using bulk actions | Always provide for "select all" feature                           |
| Wrap DataTable in a card container          | DataTable includes its own styling - use it directly              |
| Custom error alerts outside DataTable       | Use the `error` prop - DataTable handles error display            |
