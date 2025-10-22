# Unified DataTable Component - Implementation Guide

## Overview

A flexible, reusable table component that standardizes data display across the admin application. The DataTable component combines the best features from both the Documents and Objects tables into a single, configurable solution.

## Location

```
apps/admin/src/components/organisms/DataTable/
├── DataTable.tsx       # Main component implementation
├── types.ts           # TypeScript type definitions
└── index.ts           # Barrel export
```

## Features

### Core Features
- ✅ **Row Selection** - Checkboxes with "select all" functionality
- ✅ **Search** - Real-time text filtering across specified fields
- ✅ **Multi-filter Support** - Dropdown filters with checkboxes (type, status, tags, etc.)
- ✅ **Sorting** - Click column headers to sort ascending/descending
- ✅ **Bulk Actions** - Action bar appears when rows selected (delete, accept, export, etc.)
- ✅ **Row Actions** - Per-row action buttons or links
- ✅ **Loading States** - Skeleton rows during data fetch
- ✅ **Empty States** - Custom messages for empty tables or no search results
- ✅ **Error Handling** - Display error messages with icons
- ✅ **View Toggle** - Switch between table and cards view (optional)
- ✅ **Export** - Export current filtered data (optional)
- ✅ **Active Filter Badges** - Visual display of applied filters with removal

### Design Principles
- **Type-Safe** - Fully typed with TypeScript generics
- **Flexible** - Accepts any data type via generics
- **Composable** - Custom renderers for cells, cards, and actions
- **Accessible** - Uses semantic HTML and ARIA attributes
- **Consistent** - Same UX across all tables in the application

## Usage Examples

### Basic Table (Documents Page)

```tsx
import { DataTable, type ColumnDef, type RowAction } from '@/components/organisms/DataTable';

interface Document extends TableDataItem {
    filename: string;
    source_url?: string;
    mime_type: string;
    chunks: number;
    created_at: string;
}

// Define columns
const columns: ColumnDef<Document>[] = [
    {
        key: 'filename',
        label: 'Filename',
        sortable: true,
        render: (doc) => <span className="font-medium">{doc.filename}</span>,
    },
    {
        key: 'source_url',
        label: 'Source URL',
        render: (doc) => doc.source_url ? (
            <a href={doc.source_url} target="_blank" rel="noreferrer" className="link">
                {doc.source_url}
            </a>
        ) : '—',
    },
    // ... more columns
];

// Define row actions
const rowActions: RowAction<Document>[] = [
    {
        label: 'Extract',
        icon: 'lucide--sparkles',
        variant: 'primary',
        size: 'sm',
        onAction: (doc) => handleExtract(doc),
    },
    {
        label: 'View chunks',
        variant: 'ghost',
        size: 'sm',
        asLink: true,
        href: (doc) => `/admin/apps/chunks?docId=${doc.id}`,
    },
];

// Use in component
<DataTable<Document>
    data={documents}
    columns={columns}
    rowActions={rowActions}
    loading={loading}
    error={error}
    enableSearch={true}
    searchPlaceholder="Search documents..."
    getSearchText={(doc) => `${doc.filename} ${doc.source_url || ''}`}
    emptyMessage="No documents uploaded yet."
    formatDate={(date) => new Date(date).toLocaleString()}
/>
```

### Advanced Table with Filters & Bulk Actions (Objects Page)

```tsx
import { DataTable, type FilterConfig, type BulkAction } from '@/components/organisms/DataTable';

// Define filters
const filters: FilterConfig<GraphObject>[] = [
    {
        key: 'type',
        label: 'Filter by Type',
        icon: 'lucide--filter',
        options: availableTypes.map(type => ({ value: type, label: type })),
        getValue: (obj) => obj.type,
        badgeColor: 'primary',
    },
    {
        key: 'tags',
        label: 'Filter by Tag',
        icon: 'lucide--tag',
        options: availableTags.map(tag => ({ value: tag, label: tag })),
        getValue: (obj) => (obj.properties?.tags as string[]) || [],
        badgeColor: 'secondary',
    },
];

// Define bulk actions
const bulkActions: BulkAction<GraphObject>[] = [
    {
        key: 'accept',
        label: 'Accept',
        icon: 'lucide--check-circle',
        variant: 'success',
        onAction: async (selectedIds, selectedItems) => {
            await handleBulkAccept(selectedIds);
        },
    },
    {
        key: 'delete',
        label: 'Delete',
        icon: 'lucide--trash-2',
        variant: 'error',
        style: 'outline',
        onAction: async (selectedIds, selectedItems) => {
            await handleBulkDelete(selectedIds);
        },
    },
];

<DataTable<GraphObject>
    data={objects}
    columns={columns}
    filters={filters}
    bulkActions={bulkActions}
    loading={loading}
    error={error}
    enableSelection={true}
    enableSearch={true}
    onRowClick={(obj) => openDetailModal(obj)}
    onSelectionChange={(ids, items) => console.log('Selected:', ids)}
/>
```

## Type Definitions

### TableDataItem
Base interface that all table data must extend:
```tsx
interface TableDataItem {
    id: string;
    [key: string]: any;
}
```

### ColumnDef<T>
Column definition with custom render function:
```tsx
interface ColumnDef<T extends TableDataItem> {
    key: string;              // Unique identifier
    label: string;            // Header text
    width?: string;           // CSS width class
    sortable?: boolean;       // Enable sorting
    render?: (item: T) => ReactNode;  // Custom cell renderer
    headerClassName?: string; // Header CSS classes
    cellClassName?: string;   // Cell CSS classes
}
```

### FilterConfig<T>
Filter dropdown configuration:
```tsx
interface FilterConfig<T extends TableDataItem> {
    key: string;              // Unique identifier
    label: string;            // Display label
    icon?: string;            // Iconify icon name
    options: FilterOption[];  // Filter options
    getValue: (item: T) => string | string[];  // Extract filter value
    badgeColor?: 'primary' | 'secondary' | ...;  // Badge color
}
```

### BulkAction<T>
Action shown when rows selected:
```tsx
interface BulkAction<T extends TableDataItem> {
    key: string;              // Unique identifier
    label: string;            // Display label
    icon?: string;            // Iconify icon name
    variant?: 'primary' | 'secondary' | ...;
    style?: 'filled' | 'outline';
    onAction: (selectedIds: string[], selectedItems: T[]) => void | Promise<void>;
}
```

### RowAction<T>
Action shown per row:
```tsx
interface RowAction<T extends TableDataItem> {
    label: string;            // Display label
    icon?: string;            // Iconify icon name
    variant?: 'primary' | 'ghost' | ...;
    size?: 'xs' | 'sm' | 'md' | 'lg';
    onAction: (item: T) => void | Promise<void>;
    asLink?: boolean;         // Render as link
    href?: (item: T) => string;  // Link destination
}
```

## Migration from Old Tables

### Before (Documents - Inline Table)
```tsx
<table className="table">
    <thead>
        <tr>
            <th>Filename</th>
            <th>Source URL</th>
            {/* ... */}
        </tr>
    </thead>
    <tbody>
        {data.map(doc => (
            <tr key={doc.id}>
                <td>{doc.filename}</td>
                <td>{doc.source_url}</td>
                {/* ... */}
            </tr>
        ))}
    </tbody>
</table>
```

### After (Documents - DataTable)
```tsx
<DataTable<DocumentRow>
    data={data}
    columns={[
        { key: 'filename', label: 'Filename', sortable: true },
        { key: 'source_url', label: 'Source URL', render: (doc) => /* custom */ },
        // ...
    ]}
    rowActions={[/* ... */]}
    loading={loading}
    error={error}
/>
```

### Before (Objects - ObjectBrowser Component)
```tsx
<ObjectBrowser
    objects={objects}
    loading={loading}
    error={error}
    onObjectClick={handleClick}
    onBulkDelete={handleBulkDelete}
    onBulkAccept={handleBulkAccept}
    onSearchChange={handleSearch}
    onTypeFilterChange={handleTypeFilter}
    availableTypes={types}
/>
```

### After (Objects - DataTable)
```tsx
<DataTable<GraphObject>
    data={objects}
    columns={columns}
    filters={filters}
    bulkActions={bulkActions}
    onRowClick={handleClick}
    enableSelection={true}
    enableSearch={true}
/>
```

## Benefits of Unified Component

### 1. **Consistency**
- Same UX across all tables
- Users learn interaction patterns once
- Predictable behavior

### 2. **Maintainability**
- Single source of truth for table logic
- Bug fixes benefit all consumers
- Easier to add new features

### 3. **Reusability**
- Use for any data type via generics
- Configure features via props
- Share across multiple pages

### 4. **Developer Experience**
- Type-safe with TypeScript
- Clear prop interfaces
- Rich documentation

### 5. **Performance**
- Optimized rendering
- Efficient filtering and sorting
- Minimal re-renders

## Comparison: Documents vs Objects Tables

### Similarities (Now Consistent)
- ✅ **Search** - Both have search bars in toolbar
- ✅ **Date Format** - Consistent date rendering (configurable)
- ✅ **Loading States** - Skeleton rows during loading
- ✅ **Empty States** - Custom empty messages
- ✅ **Row Actions** - Per-row action buttons
- ✅ **Error Handling** - Error display with icons
- ✅ **Sorting** - Click headers to sort

### Key Differences (Intentional)

| Feature | Documents | Objects |
|---------|-----------|---------|
| **Row Selection** | Not needed | Enabled for bulk review |
| **Bulk Actions** | Not needed | Accept/Delete for AI extraction |
| **Filters** | Not needed | Type/Tag filters for graph data |
| **Upload Zone** | Yes | No (different source) |
| **Extract Action** | Yes (per row) | No (bulk workflow) |
| **Status Badges** | No | Yes (accepted/draft/rejected) |
| **Confidence Score** | No | Yes (AI extraction quality) |
| **Date Format** | `toLocaleString()` | `toLocaleDateString()` |

## Component Architecture

```
DataTable Component
│
├── Toolbar
│   ├── Search Input
│   ├── Filter Dropdowns (dynamic)
│   ├── View Toggle (optional)
│   └── Export Button (optional)
│
├── Active Filter Badges
│   └── Removable badges per filter
│
├── Bulk Actions Bar (conditional)
│   └── Action buttons when rows selected
│
└── Table View
    ├── Header Row
    │   ├── Select All Checkbox (optional)
    │   ├── Column Headers (sortable)
    │   └── Actions Column (if row actions)
    │
    ├── Data Rows (or skeleton/empty/error)
    │   ├── Selection Checkbox (optional)
    │   ├── Custom Cell Renderers
    │   └── Row Action Buttons
    │
    └── Card View (optional)
        └── Custom card renderer per item
```

## Best Practices

### 1. **Column Definitions**
- Keep render functions pure (no side effects)
- Use `render` for complex formatting
- Set `sortable: true` only for sortable data
- Use semantic CSS classes for styling

### 2. **Filter Configuration**
- Provide meaningful filter labels
- Use icons for visual clarity
- Choose appropriate badge colors
- Keep filter options concise

### 3. **Actions**
- Use descriptive labels
- Include icons for clarity
- Choose appropriate variants (primary/ghost/error)
- Handle loading states in handlers

### 4. **Performance**
- Memoize heavy computations
- Use React.memo for stable components
- Avoid inline function definitions
- Debounce search if large datasets

### 5. **Accessibility**
- Provide meaningful labels
- Use semantic HTML
- Include ARIA attributes
- Ensure keyboard navigation

## Future Enhancements

### Planned Features
- [ ] **Pagination** - Client-side and server-side
- [ ] **Column Resizing** - Draggable column widths
- [ ] **Column Visibility** - Show/hide columns
- [ ] **Persistent State** - Save filters/sort in localStorage
- [ ] **Drag & Drop** - Reorder rows (if needed)
- [ ] **Inline Editing** - Edit cells directly
- [ ] **Nested Rows** - Expandable row details
- [ ] **Virtual Scrolling** - For large datasets
- [ ] **CSV Export** - Built-in export functionality
- [ ] **Print Styles** - Optimized for printing

### Extension Points
The component is designed to be extended without breaking changes:
- Add new filter types
- Add new bulk actions
- Customize rendering
- Add new props
- Create variants

## Related Documentation
- [Atomic Design Instructions](../.github/instructions/atomic-design.instructions.md)
- [Testing Instructions](../.github/instructions/testing.instructions.md)
- [DaisyUI Instructions](../.github/instructions/daisyui.instructions.md)

## Troubleshooting

### Common Issues

#### Columns not displaying correctly
- Verify `key` matches data property
- Check if `render` function returns valid ReactNode
- Ensure data type extends `TableDataItem`

#### Filters not working
- Verify `getValue` function returns correct type
- Check filter options match actual data values
- Ensure filter key is unique

#### Sorting not working
- Set `sortable: true` on column
- Verify column key exists in data
- Check data type is comparable (string/number/date)

#### Actions not clickable
- Check `onAction` handler is defined
- Verify `href` function returns valid path
- Ensure event propagation isn't stopped

## Support

For questions or issues:
1. Check this documentation first
2. Review type definitions in `types.ts`
3. Look at working examples (Documents/Objects pages)
4. Review component source code
5. Open discussion in team channel

---

**Last Updated:** October 22, 2025  
**Component Version:** 1.0.0  
**Maintained By:** Frontend Team
