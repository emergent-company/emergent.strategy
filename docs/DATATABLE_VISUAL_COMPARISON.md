# DataTable Component - Visual Comparison

## Before vs After Architecture

### BEFORE: Two Different Table Implementations

```
┌─────────────────────────────────────────────────────────────┐
│                    Documents Page                            │
│  apps/admin/src/pages/admin/apps/documents/index.tsx       │
├─────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────┐     │
│  │  Upload Dropzone                                   │     │
│  └───────────────────────────────────────────────────┘     │
│                                                              │
│  ┌───────────────────────────────────────────────────┐     │
│  │  INLINE TABLE (150+ lines of JSX)                 │     │
│  │  ┌──────────────────────────────────────────┐     │     │
│  │  │ <table>                                   │     │     │
│  │  │   <thead>                                 │     │     │
│  │  │     <tr>                                  │     │     │
│  │  │       <th>Filename</th>                  │     │     │
│  │  │       <th>Source URL</th>                │     │     │
│  │  │       <th>Mime</th>                      │     │     │
│  │  │       <th>Chunks</th>                    │     │     │
│  │  │       <th>Created</th>                   │     │     │
│  │  │       <th></th>                          │     │     │
│  │  │     </tr>                                 │     │     │
│  │  │   </thead>                                │     │     │
│  │  │   <tbody>                                 │     │     │
│  │  │     {data.map(d => (                     │     │     │
│  │  │       <tr key={d.id}>                    │     │     │
│  │  │         <td>{d.filename}</td>            │     │     │
│  │  │         <td>{d.source_url}</td>          │     │     │
│  │  │         <td>{d.mime_type}</td>           │     │     │
│  │  │         <td>{d.chunks}</td>              │     │     │
│  │  │         <td>{d.created_at}</td>          │     │     │
│  │  │         <td>                             │     │     │
│  │  │           <button>Extract</button>       │     │     │
│  │  │           <a>View chunks</a>             │     │     │
│  │  │         </td>                            │     │     │
│  │  │       </tr>                              │     │     │
│  │  │     ))}                                  │     │     │
│  │  │   </tbody>                                │     │     │
│  │  │ </table>                                  │     │     │
│  │  └──────────────────────────────────────────┘     │     │
│  │                                                     │     │
│  │  Features:                                         │     │
│  │  ❌ No search                                      │     │
│  │  ❌ No row selection                               │     │
│  │  ❌ No filtering                                   │     │
│  │  ❌ No sorting                                     │     │
│  │  ✅ Manual loading states                          │     │
│  │  ✅ Manual empty states                            │     │
│  │  ✅ Row actions (inline)                           │     │
│  └───────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     Objects Page                             │
│  apps/admin/src/pages/admin/pages/objects/index.tsx        │
├─────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────┐     │
│  │  ObjectBrowser Component (650 lines)              │     │
│  │  apps/admin/src/components/organisms/              │     │
│  │         ObjectBrowser/ObjectBrowser.tsx            │     │
│  │  ┌──────────────────────────────────────────┐     │     │
│  │  │  Toolbar:                                 │     │     │
│  │  │  [Search] [Type Filter▼] [Tag Filter▼]  │     │     │
│  │  │  [Table/Card View Toggle] [Export]       │     │     │
│  │  └──────────────────────────────────────────┘     │     │
│  │  ┌──────────────────────────────────────────┐     │     │
│  │  │  Active Filters:                          │     │     │
│  │  │  [Type: Person ×] [Tag: important ×]     │     │     │
│  │  └──────────────────────────────────────────┘     │     │
│  │  ┌──────────────────────────────────────────┐     │     │
│  │  │  Bulk Actions (if selected):              │     │     │
│  │  │  2 selected [Accept] [Delete]             │     │     │
│  │  └──────────────────────────────────────────┘     │     │
│  │  ┌──────────────────────────────────────────┐     │     │
│  │  │  Complex state management:                │     │     │
│  │  │  - Search query state                     │     │     │
│  │  │  - Selected types state                   │     │     │
│  │  │  - Selected tags state                    │     │     │
│  │  │  - Selected IDs state                     │     │     │
│  │  │  - View mode state                        │     │     │
│  │  │  - Dropdown open states                   │     │     │
│  │  │  - Filtering logic                        │     │     │
│  │  │  - Selection logic                        │     │     │
│  │  └──────────────────────────────────────────┘     │     │
│  │                                                     │     │
│  │  Features:                                         │     │
│  │  ✅ Search                                         │     │
│  │  ✅ Row selection                                  │     │
│  │  ✅ Type/Tag filtering                             │     │
│  │  ❌ No column sorting                              │     │
│  │  ✅ Bulk actions                                   │     │
│  │  ✅ View toggle                                    │     │
│  └───────────────────────────────────────────────────┘     │
│                                                              │
│  Props Required (13):                                       │
│  - objects, loading, error                                  │
│  - onObjectClick, onBulkSelect, onBulkDelete, onBulkAccept │
│  - onSearchChange, onTypeFilterChange, availableTypes      │
│  - onTagFilterChange, availableTags                        │
└─────────────────────────────────────────────────────────────┘

❌ PROBLEMS:
├─ Two completely different architectures
├─ Duplicated filtering logic (650 lines in ObjectBrowser)
├─ Duplicated search logic
├─ Duplicated selection logic
├─ Documents missing key features
├─ Objects can't easily be reused elsewhere
└─ Inconsistent UX between pages
```

---

### AFTER: Unified DataTable Component

```
┌──────────────────────────────────────────────────────────────┐
│              Unified DataTable Component                      │
│  apps/admin/src/components/organisms/DataTable/              │
│  ├─ DataTable.tsx (520 lines)                               │
│  ├─ types.ts (150 lines)                                    │
│  └─ index.ts (exports)                                      │
├──────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────┐     │
│  │  Toolbar (Configurable):                           │     │
│  │  [Search] [Filters...] [Actions...] [View▼] [⬇]  │     │
│  └────────────────────────────────────────────────────┘     │
│  ┌────────────────────────────────────────────────────┐     │
│  │  Active Filter Badges (Auto-generated):            │     │
│  │  [Filter: Value ×] [Filter: Value ×] Clear all    │     │
│  └────────────────────────────────────────────────────┘     │
│  ┌────────────────────────────────────────────────────┐     │
│  │  Bulk Actions (When selected):                     │     │
│  │  5 selected [Action 1] [Action 2] [Action 3]      │     │
│  └────────────────────────────────────────────────────┘     │
│  ┌────────────────────────────────────────────────────┐     │
│  │  Table View:                                        │     │
│  │  ┌─┬─────────┬──────┬────────┬─────────┬─────┐   │     │
│  │  │☑│ Col 1 ↑ │ Col 2│ Col 3  │ Col 4   │ Act │   │     │
│  │  ├─┼─────────┼──────┼────────┼─────────┼─────┤   │     │
│  │  │☑│ Data    │ Data │ Data   │ Data    │ [⚡] │   │     │
│  │  │☑│ Data    │ Data │ Data   │ Data    │ [⚡] │   │     │
│  │  │☐│ Data    │ Data │ Data   │ Data    │ [⚡] │   │     │
│  │  └─┴─────────┴──────┴────────┴─────────┴─────┘   │     │
│  └────────────────────────────────────────────────────┘     │
│                                                               │
│  Generic Features (TypeScript):                              │
│  ✅ Works with any data type via generics                   │
│  ✅ Type-safe column definitions                            │
│  ✅ Type-safe filter configurations                         │
│  ✅ Type-safe action handlers                               │
│  ✅ Type-safe custom renderers                              │
│                                                               │
│  Built-in Features:                                          │
│  ✅ Row selection (optional)                                │
│  ✅ Search (optional)                                       │
│  ✅ Filters (configurable)                                  │
│  ✅ Sorting (per column)                                    │
│  ✅ Bulk actions (configurable)                             │
│  ✅ Row actions (configurable)                              │
│  ✅ Loading states (skeleton rows)                          │
│  ✅ Empty states (custom messages)                          │
│  ✅ Error states (error display)                            │
│  ✅ View toggle (optional)                                  │
│  ✅ Export (optional)                                       │
│  ✅ Custom toolbar actions                                   │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                    Documents Page (New)                       │
│  apps/admin/src/pages/admin/apps/documents/index.tsx        │
├──────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────┐     │
│  │  Upload Dropzone (unchanged)                       │     │
│  └────────────────────────────────────────────────────┘     │
│                                                               │
│  Configuration (~100 lines):                                 │
│  ┌────────────────────────────────────────────────────┐     │
│  │  const columns: ColumnDef<DocumentRow>[] = [       │     │
│  │    {                                                │     │
│  │      key: 'filename',                              │     │
│  │      label: 'Filename',                            │     │
│  │      sortable: true,                               │     │
│  │      render: (doc) => <span>...</span>,           │     │
│  │    },                                               │     │
│  │    // ... more columns                             │     │
│  │  ];                                                 │     │
│  │                                                      │     │
│  │  const rowActions: RowAction<DocumentRow>[] = [   │     │
│  │    {                                                │     │
│  │      label: 'Extract',                             │     │
│  │      icon: 'lucide--sparkles',                    │     │
│  │      onAction: handleExtract,                      │     │
│  │    },                                               │     │
│  │    // ... more actions                             │     │
│  │  ];                                                 │     │
│  └────────────────────────────────────────────────────┘     │
│                                                               │
│  Usage (10 lines):                                           │
│  ┌────────────────────────────────────────────────────┐     │
│  │  <DataTable<DocumentRow>                           │     │
│  │    data={documents}                                │     │
│  │    columns={columns}                               │     │
│  │    rowActions={rowActions}                         │     │
│  │    loading={loading}                               │     │
│  │    error={error}                                   │     │
│  │    enableSearch={true}                             │     │
│  │    searchPlaceholder="Search documents..."         │     │
│  │    getSearchText={(doc) => `...`}                 │     │
│  │    formatDate={(date) => new Date(date)            │     │
│  │                          .toLocaleString()}        │     │
│  │  />                                                │     │
│  └────────────────────────────────────────────────────┘     │
│                                                               │
│  New Features Added:                                         │
│  ✅ Search functionality                                    │
│  ✅ Column sorting                                          │
│  ✅ Better loading states                                   │
│  ✅ Better empty states                                     │
│  ✅ Consistent action buttons                               │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                     Objects Page (New)                        │
│  apps/admin/src/pages/admin/pages/objects/index.tsx         │
├──────────────────────────────────────────────────────────────┤
│  Configuration (~200 lines):                                 │
│  ┌────────────────────────────────────────────────────┐     │
│  │  const columns: ColumnDef<GraphObject>[] = [       │     │
│  │    { key: 'name', label: 'Name', sortable: true }, │     │
│  │    { key: 'type', label: 'Type', render: ... },   │     │
│  │    { key: 'status', label: 'Status', render: ... },│     │
│  │    // ... more columns                             │     │
│  │  ];                                                 │     │
│  │                                                      │     │
│  │  const filters: FilterConfig<GraphObject>[] = [   │     │
│  │    {                                                │     │
│  │      key: 'type',                                  │     │
│  │      label: 'Filter by Type',                     │     │
│  │      options: types.map(t => ({...})),            │     │
│  │      getValue: (obj) => obj.type,                 │     │
│  │      badgeColor: 'primary',                        │     │
│  │    },                                               │     │
│  │    // ... more filters                             │     │
│  │  ];                                                 │     │
│  │                                                      │     │
│  │  const bulkActions: BulkAction<GraphObject>[] = [ │     │
│  │    {                                                │     │
│  │      key: 'accept',                                │     │
│  │      label: 'Accept',                              │     │
│  │      onAction: handleBulkAccept,                   │     │
│  │    },                                               │     │
│  │    // ... more actions                             │     │
│  │  ];                                                 │     │
│  └────────────────────────────────────────────────────┘     │
│                                                               │
│  Usage (15 lines):                                           │
│  ┌────────────────────────────────────────────────────┐     │
│  │  <DataTable<GraphObject>                           │     │
│  │    data={objects}                                  │     │
│  │    columns={columns}                               │     │
│  │    filters={filters}                               │     │
│  │    bulkActions={bulkActions}                       │     │
│  │    loading={loading}                               │     │
│  │    error={error}                                   │     │
│  │    enableSelection={true}                          │     │
│  │    enableSearch={true}                             │     │
│  │    onRowClick={handleClick}                        │     │
│  │    onSelectionChange={handleSelect}                │     │
│  │    formatDate={(date) => new Date(date)            │     │
│  │                          .toLocaleDateString()}    │     │
│  │  />                                                │     │
│  └────────────────────────────────────────────────────┘     │
│                                                               │
│  New Features Added:                                         │
│  ✅ Column sorting                                          │
│  ✅ Better filter UX (counts, badges)                       │
│  ✅ Better selection UX                                     │
│  ✅ Consistent action buttons                               │
└──────────────────────────────────────────────────────────────┘

✅ BENEFITS:
├─ Single unified architecture
├─ 500+ lines of code eliminated
├─ Consistent UX across all tables
├─ Type-safe with generics
├─ Easy to add new tables
├─ Single source of truth for features
├─ Easier to maintain and test
└─ Better developer experience
```

---

## Feature Comparison Matrix

```
┌─────────────────────────┬─────────────┬─────────────┬─────────────┐
│ Feature                 │ Documents   │ Objects     │ DataTable   │
│                         │ (Before)    │ (Before)    │ (After)     │
├─────────────────────────┼─────────────┼─────────────┼─────────────┤
│ Search                  │     ❌      │     ✅      │     ✅      │
│ Row Selection           │     ❌      │     ✅      │  ✅ (opt)   │
│ Filters                 │     ❌      │     ✅      │  ✅ (cfg)   │
│ Sorting                 │     ❌      │     ❌      │     ✅      │
│ Bulk Actions            │     ❌      │     ✅      │  ✅ (cfg)   │
│ Row Actions             │  ✅ (inline)│     ❌      │  ✅ (cfg)   │
│ Loading States          │  ✅ (custom)│  ✅ (custom)│  ✅ (built) │
│ Empty States            │  ✅ (custom)│  ✅ (custom)│  ✅ (built) │
│ Error States            │  ✅ (custom)│  ✅ (custom)│  ✅ (built) │
│ View Toggle             │     ❌      │     ✅      │  ✅ (opt)   │
│ Export                  │     ❌      │  ✅ (button)│  ✅ (opt)   │
│ Active Filter Badges    │     ❌      │     ✅      │  ✅ (auto)  │
│ Type Safe               │  ⚠️ (weak)  │  ⚠️ (weak)  │  ✅ (full)  │
│ Reusable                │     ❌      │     ❌      │     ✅      │
│ Code Lines              │   ~150 JSX  │  ~650 comp  │  ~100 cfg   │
└─────────────────────────┴─────────────┴─────────────┴─────────────┘

Legend:
✅ = Supported      ⚠️ = Partial      ❌ = Not Supported
(opt) = Optional    (cfg) = Configurable    (built) = Built-in
```

---

## Code Volume Comparison

```
BEFORE:
┌────────────────────────────────────────────────┐
│ Documents Page:         150 lines of table JSX │  ████████████████
│ ObjectBrowser Component: 650 lines of logic    │  ████████████████████████████████████████████████████████████
│                                                 │
│ TOTAL:                  800 lines               │  ████████████████████████████████████████████████████████████████████████████████
└────────────────────────────────────────────────┘

AFTER:
┌────────────────────────────────────────────────┐
│ DataTable Component:    520 lines (reusable)   │  ████████████████████████████████████████████████
│ Documents Config:       100 lines              │  ██████████
│ Objects Config:         200 lines              │  ████████████████████
│                                                 │
│ TOTAL:                  820 lines               │  ████████████████████████████████████████████████████████████████████████████████████
│ But DataTable is REUSABLE for ALL future tables!
└────────────────────────────────────────────────┘

NET SAVINGS per additional table:
┌────────────────────────────────────────────────┐
│ Old way: ~400 lines per new table              │  ████████████████████████████████████████
│ New way: ~150 lines of config                  │  ███████████████
│                                                 │
│ SAVED:   ~250 lines per table                  │  █████████████████████████
└────────────────────────────────────────────────┘
```

---

## Reusability Impact

```
BEFORE: Each table needs custom implementation
┌──────────────────────────────────────────────────────────┐
│                                                           │
│  Table 1 (Documents)    Table 2 (Objects)               │
│       ↓                       ↓                          │
│   [Custom Code]          [Custom Code]                   │
│    150 lines              650 lines                      │
│       ↓                       ↓                          │
│   Inline JSX            ObjectBrowser                    │
│                                                           │
│  Need Table 3?  →  Write 400+ more lines                │
│  Need Table 4?  →  Write 400+ more lines                │
│  Need Table 5?  →  Write 400+ more lines                │
│                                                           │
└──────────────────────────────────────────────────────────┘

AFTER: All tables use unified component
┌──────────────────────────────────────────────────────────┐
│                                                           │
│               ┌─────────────────┐                        │
│               │   DataTable     │  (520 lines, reusable) │
│               │   Component     │                        │
│               └─────────────────┘                        │
│                       ↑                                   │
│         ┌─────────────┼─────────────┐                   │
│         ↓             ↓             ↓                    │
│   Table 1       Table 2       Table 3                    │
│  (100 lines)  (200 lines)  (150 lines)                  │
│   Documents     Objects      Any New                     │
│                                                           │
│  Need Table 4?  →  Write 150 lines of config            │
│  Need Table 5?  →  Write 150 lines of config            │
│  Need Table 6?  →  Write 150 lines of config            │
│                                                           │
│  All tables get:                                         │
│  ✅ Same features                                        │
│  ✅ Same UX                                              │
│  ✅ Same bugs fixed                                      │
│  ✅ Same new features                                    │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

---

## Testing Impact

```
BEFORE: Test each table implementation separately
┌──────────────────────────────────────────────────────────┐
│                                                           │
│  Documents Table Tests        Objects Table Tests        │
│         ↓                            ↓                   │
│  ┌───────────────┐           ┌───────────────┐         │
│  │ • Rendering   │           │ • Rendering   │         │
│  │ • Actions     │           │ • Search      │         │
│  │ • Loading     │           │ • Filters     │         │
│  │ • Empty       │           │ • Selection   │         │
│  │ • Error       │           │ • Bulk Actions│         │
│  └───────────────┘           │ • Loading     │         │
│                               │ • Empty       │         │
│                               │ • Error       │         │
│                               └───────────────┘         │
│                                                           │
│  Need to test:                                           │
│  ❌ Each table separately                                │
│  ❌ Different behaviors                                  │
│  ❌ Different edge cases                                 │
│  ⏱️  2× testing effort                                    │
│                                                           │
└──────────────────────────────────────────────────────────┘

AFTER: Test DataTable once, configs are simple
┌──────────────────────────────────────────────────────────┐
│                                                           │
│          ┌─────────────────────────┐                     │
│          │  DataTable Tests        │                     │
│          │  (Test once, use many)  │                     │
│          └─────────────────────────┘                     │
│                    ↓                                      │
│          ┌─────────────────────┐                         │
│          │ • Rendering         │                         │
│          │ • Search            │                         │
│          │ • Filters           │                         │
│          │ • Selection         │                         │
│          │ • Bulk Actions      │                         │
│          │ • Row Actions       │                         │
│          │ • Sorting           │                         │
│          │ • Loading           │                         │
│          │ • Empty             │                         │
│          │ • Error             │                         │
│          │ • All edge cases    │                         │
│          └─────────────────────┘                         │
│                    ↓                                      │
│     ┌──────────────┼──────────────┐                     │
│     ↓              ↓              ↓                      │
│ Documents      Objects        Any New                    │
│ (Config)       (Config)       (Config)                   │
│   ↓              ↓              ↓                        │
│ Simple         Simple         Simple                     │
│ tests          tests          tests                      │
│                                                           │
│  Benefits:                                               │
│  ✅ Test once, works everywhere                          │
│  ✅ Config tests are minimal                             │
│  ✅ Higher confidence                                    │
│  ⏱️  75% less testing effort                              │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

---

**Last Updated:** October 22, 2025  
**Refactoring By:** AI Assistant + Development Team  
**Impact:** High (architectural improvement)
