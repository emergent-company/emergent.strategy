# Page Patterns for AI Assistants

This document helps AI assistants understand page architecture patterns and create consistent, well-structured pages.

## Page Pattern Overview

| Pattern         | Use Case                            | Key Components                        | Example Pages                              |
| --------------- | ----------------------------------- | ------------------------------------- | ------------------------------------------ |
| **List Page**   | Browse, filter, search entity lists | DataTable, filters, bulk actions      | ObjectsPage, ExtractionJobsPage            |
| **Detail Page** | View/edit single entity             | Card sections, tabs, modals           | ExtractionJobDetailPage, ObjectDetailModal |
| **Settings**    | Configuration forms                 | Card sections, FormField, toggles     | ProfileSettings, LLMSettingsPage           |
| **Dashboard**   | Metrics, monitoring, analytics      | Stats, charts, filters, manual tables | MonitoringDashboard, ChatSessionsListPage  |

---

## Pattern 1: List Page

List pages display paginated, filterable collections of entities with optional bulk actions.

### Structure

```tsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useConfig } from '@/contexts/config';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { useDataUpdates } from '@/contexts/data-updates';
import { PageContainer } from '@/components/layouts';
import {
  DataTable,
  type ColumnDef,
  type FilterConfig,
  type BulkAction,
  type TableDataItem,
} from '@/components/organisms/DataTable';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';

interface MyEntity extends TableDataItem {
  id: string;
  name: string;
  status: string;
  created_at: string;
}

export default function MyEntitiesPage() {
  const { config } = useConfig();
  const { apiBase, fetchJson } = useApi();
  const { showToast } = useToast();

  // Data state
  const [entities, setEntities] = useState<MyEntity[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);

  // Modal state
  const [selectedEntity, setSelectedEntity] = useState<MyEntity | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Fetch data
  const loadEntities = useCallback(async () => {
    if (!config.activeProjectId) return;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('q', searchQuery);
      params.append('limit', '100');

      const response = await fetchJson<{ items: MyEntity[]; total: number }>(
        `${apiBase}/api/entities?${params}`
      );

      setEntities(response.items);
      setTotalCount(response.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [config.activeProjectId, searchQuery, apiBase, fetchJson]);

  // Real-time updates via SSE
  useDataUpdates('entity:*', () => {
    loadEntities(); // Refetch on entity changes
  });

  useEffect(() => {
    loadEntities();
  }, [loadEntities]);

  // Project gate
  if (!config.activeProjectId) {
    return (
      <PageContainer>
        <div className="alert alert-warning">
          <Icon icon="lucide--alert-circle" />
          <span>Please select a project to view entities</span>
        </div>
      </PageContainer>
    );
  }

  // Define columns
  const columns: ColumnDef<MyEntity>[] = [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
      render: (entity) => <span className="font-medium">{entity.name}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (entity) => (
        <span className="badge badge-sm badge-ghost">{entity.status}</span>
      ),
    },
    {
      key: 'created_at',
      label: 'Created',
      sortable: true,
      render: (entity) => (
        <span className="text-sm text-base-content/70">
          {new Date(entity.created_at).toLocaleDateString()}
        </span>
      ),
    },
  ];

  // Define filters
  const filters: FilterConfig<MyEntity>[] = [
    {
      key: 'status',
      label: 'Filter by Status',
      icon: 'lucide--filter',
      options: [
        { value: 'active', label: 'Active' },
        { value: 'pending', label: 'Pending' },
      ],
      getValue: (entity) => entity.status,
      badgeColor: 'primary',
    },
  ];

  // Define bulk actions
  const bulkActions: BulkAction<MyEntity>[] = [
    {
      key: 'delete',
      label: 'Delete',
      icon: 'lucide--trash-2',
      variant: 'error',
      style: 'outline',
      onActionWithContext: async (context) => {
        // Handle bulk delete
      },
    },
  ];

  return (
    <PageContainer maxWidth="full" className="px-4" testId="page-my-entities">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-bold text-2xl inline-flex items-center gap-2">
          My Entities
          {!loading && (
            <span className="badge badge-ghost badge-lg font-normal">
              {totalCount}
            </span>
          )}
        </h1>
        <p className="mt-1 text-base-content/70">
          Browse and manage your entities
        </p>
      </div>

      {/* DataTable */}
      <DataTable<MyEntity>
        data={entities}
        columns={columns}
        loading={loading}
        error={error}
        enableSelection={true}
        enableSearch={true}
        searchPlaceholder="Search entities..."
        onSearch={setSearchQuery}
        filters={filters}
        bulkActions={bulkActions}
        totalCount={totalCount}
        rowActions={[
          {
            label: 'View Details',
            icon: 'lucide--eye',
            onAction: (entity) => {
              setSelectedEntity(entity);
              setIsModalOpen(true);
            },
          },
          {
            label: 'Delete',
            icon: 'lucide--trash-2',
            variant: 'error',
            onAction: (entity) => handleDelete(entity.id),
          },
        ]}
        useDropdownActions={true}
        onRowClick={(entity) => {
          setSelectedEntity(entity);
          setIsModalOpen(true);
        }}
        emptyMessage="No entities found."
        emptyIcon="lucide--inbox"
      />
    </PageContainer>
  );
}
```

### Key Elements

| Element           | Purpose                               | Required |
| ----------------- | ------------------------------------- | -------- |
| `PageContainer`   | Consistent page wrapper               | Yes      |
| Header with count | Title + badge showing total           | Yes      |
| `DataTable`       | List with sorting, filtering, actions | Yes      |
| Project gate      | Check `config.activeProjectId`        | Yes      |
| `useDataUpdates`  | Real-time SSE subscriptions           | Optional |
| Detail modal      | View/edit selected entity             | Optional |

### DataTable Props Quick Reference

```tsx
<DataTable<T>
  // Required
  data={items}
  columns={columns}

  // Loading/Error
  loading={boolean}
  error={string | null}

  // Selection
  enableSelection={boolean}
  onSelectionChange={(ids) => void}
  bulkActions={BulkAction[]}

  // Search
  enableSearch={boolean}
  searchPlaceholder="Search..."
  onSearch={(query) => void}

  // Filters
  filters={FilterConfig[]}

  // Row actions
  rowActions={RowAction[]}
  useDropdownActions={boolean}  // Use dropdown instead of inline buttons
  onRowClick={(item) => void}

  // Pagination
  totalCount={number}

  // Empty states
  emptyMessage="No items found"
  emptyIcon="lucide--inbox"
  noResultsMessage="No matches"

  // Toolbar
  toolbarActions={ReactNode}  // Custom toolbar buttons
/>
```

---

## Pattern 2: Settings/Form Page

Settings pages handle configuration with form fields, save/reset actions.

### Structure

```tsx
import { useEffect, useState } from 'react';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { PageContainer } from '@/components/layouts';
import { FormField } from '@/components/molecules/FormField';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';

interface SettingsData {
  settingA: string;
  settingB: boolean;
  settingC: number;
}

const DEFAULT_SETTINGS: SettingsData = {
  settingA: '',
  settingB: false,
  settingC: 10,
};

export default function MySettingsPage() {
  const { fetchJson, apiBase } = useApi();
  const { showToast } = useToast();

  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [originalSettings, setOriginalSettings] = useState<SettingsData | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load settings
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await fetchJson<SettingsData>(`${apiBase}/api/settings`);
      setSettings(data);
      setOriginalSettings(data);
    } catch (err) {
      showToast({ message: 'Failed to load settings', variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Check for changes
  const hasChanges = () => {
    if (!settings || !originalSettings) return false;
    return JSON.stringify(settings) !== JSON.stringify(originalSettings);
  };

  // Save settings
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    setSaving(true);
    try {
      const updated = await fetchJson<SettingsData>(`${apiBase}/api/settings`, {
        method: 'PUT',
        body: settings,
      });
      setSettings(updated);
      setOriginalSettings(updated);
      showToast({ message: 'Settings saved', variant: 'success' });
    } catch (err) {
      showToast({ message: 'Failed to save', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Reset to original
  const handleReset = () => {
    if (originalSettings) {
      setSettings(originalSettings);
    }
  };

  // Reset to defaults
  const handleResetToDefaults = () => {
    setSettings(DEFAULT_SETTINGS);
  };

  if (loading) {
    return (
      <PageContainer maxWidth="4xl">
        <div className="flex items-center justify-center min-h-[400px]">
          <Spinner size="lg" />
        </div>
      </PageContainer>
    );
  }

  if (!settings) {
    return (
      <PageContainer maxWidth="4xl">
        <div className="alert alert-error">
          <Icon icon="lucide--alert-circle" />
          <span>Error loading settings</span>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="4xl" testId="page-my-settings">
      {/* Breadcrumbs (optional) */}
      <div className="text-sm breadcrumbs">
        <ul>
          <li>
            <a href="/admin">Admin</a>
          </li>
          <li>Settings</li>
          <li>My Settings</li>
        </ul>
      </div>

      {/* Page header */}
      <h1 className="mt-4 font-semibold text-xl">My Settings</h1>
      <p className="mt-2 text-base-content/70">Configure your preferences</p>

      {/* Settings card */}
      <div className="bg-base-100 mt-6 card-border card">
        <div className="gap-6 sm:gap-8 card-body">
          <form onSubmit={handleSave}>
            {/* Form fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                label="Setting A"
                type="text"
                value={settings.settingA}
                onChange={(e) =>
                  setSettings({ ...settings, settingA: e.target.value })
                }
                placeholder="Enter value"
                description="Description of what this setting does"
              />

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Setting B</h3>
                  <p className="text-sm text-base-content/70">
                    Toggle description
                  </p>
                </div>
                <input
                  type="checkbox"
                  className="toggle toggle-primary"
                  checked={settings.settingB}
                  onChange={(e) =>
                    setSettings({ ...settings, settingB: e.target.checked })
                  }
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex justify-between items-center gap-3 mt-6 pt-6 border-t border-base-200">
              <button
                type="button"
                className="btn btn-sm btn-ghost text-warning"
                onClick={handleResetToDefaults}
                disabled={saving}
              >
                Reset to Defaults
              </button>

              <div className="flex gap-3">
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={handleReset}
                  disabled={saving || !hasChanges()}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-sm btn-primary"
                  disabled={saving || !hasChanges()}
                >
                  {saving ? (
                    <>
                      <Spinner size="xs" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Additional sections (optional) */}
      <div className="mt-8">
        <h2 className="font-semibold text-lg">Another Section</h2>
        <div className="bg-base-100 mt-4 card-border card">
          <div className="card-body">{/* More settings */}</div>
        </div>
      </div>

      {/* Danger zone (optional) */}
      <div className="mt-8">
        <h2 className="font-semibold text-lg text-error">Danger Zone</h2>
        <div className="bg-base-100 mt-4 card border border-error/30">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">Delete Something</h3>
                <p className="text-sm text-base-content/70">
                  This action cannot be undone.
                </p>
              </div>
              <button className="btn btn-error btn-outline btn-sm">
                <Icon icon="lucide--trash-2" className="size-4" />
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
```

### Key Elements

| Element             | Purpose                       | Required |
| ------------------- | ----------------------------- | -------- |
| `maxWidth="4xl"`    | Narrower container for forms  | Yes      |
| Loading state       | Spinner while fetching        | Yes      |
| Error state         | Alert when load fails         | Yes      |
| `hasChanges()`      | Enable/disable save button    | Yes      |
| Reset button        | Revert to loaded values       | Yes      |
| Reset to defaults   | Revert to hardcoded defaults  | Optional |
| Danger zone section | Destructive actions at bottom | Optional |

### Form Field Patterns

```tsx
// Text input
<FormField
  label="Label"
  type="text"
  value={value}
  onChange={(e) => setValue(e.target.value)}
  placeholder="Placeholder"
  description="Helper text"
/>

// Toggle
<div className="flex items-center justify-between">
  <div>
    <h3 className="font-medium">Toggle Label</h3>
    <p className="text-sm text-base-content/70">Description</p>
  </div>
  <input
    type="checkbox"
    className="toggle toggle-primary"
    checked={checked}
    onChange={(e) => setChecked(e.target.checked)}
  />
</div>

// Select
<div className="form-control">
  <label className="label">
    <span className="label-text">Select Label</span>
  </label>
  <select
    className="select select-bordered"
    value={selected}
    onChange={(e) => setSelected(e.target.value)}
  >
    <option value="">Select...</option>
    <option value="a">Option A</option>
  </select>
</div>
```

---

## Pattern 3: Dashboard Page

Dashboard pages show aggregated data, metrics, and monitoring views.

### Structure

```tsx
import { useState, useEffect, useCallback } from 'react';
import { useConfig } from '@/contexts/config';
import { useApi } from '@/hooks/use-api';
import { OrgAndProjectGate } from '@/components/organisms/OrgAndProjectGate';
import { PageContainer } from '@/components/layouts';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';

interface DashboardStats {
  totalItems: number;
  activeItems: number;
  recentActivity: Activity[];
}

export default function MyDashboardPage() {
  const { config } = useConfig();
  const { apiBase, fetchJson } = useApi();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('7d');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  const loadData = useCallback(async () => {
    if (!config.activeProjectId) return;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        timeRange,
        page: String(page),
        limit: String(pageSize),
      });

      const data = await fetchJson<DashboardStats>(
        `${apiBase}/api/dashboard?${params}`
      );
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [config.activeProjectId, timeRange, page, pageSize, apiBase, fetchJson]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <OrgAndProjectGate>
      <PageContainer maxWidth="full" className="px-4" testId="page-dashboard">
        {/* Header with filters */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="font-bold text-2xl">Dashboard</h1>
            <p className="mt-1 text-base-content/70">Monitor your activity</p>
          </div>

          {/* Time range filter */}
          <div className="flex gap-2">
            {(['24h', '7d', '30d'] as const).map((range) => (
              <button
                key={range}
                className={`btn btn-sm ${
                  timeRange === range ? 'btn-primary' : 'btn-ghost'
                }`}
                onClick={() => {
                  setTimeRange(range);
                  setPage(1);
                }}
              >
                {range}
              </button>
            ))}
          </div>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="stat bg-base-100 rounded-box shadow-sm">
            <div className="stat-title">Total Items</div>
            <div className="stat-value">
              {loading ? <Spinner size="sm" /> : stats?.totalItems ?? 0}
            </div>
          </div>
          <div className="stat bg-base-100 rounded-box shadow-sm">
            <div className="stat-title">Active Items</div>
            <div className="stat-value text-success">
              {loading ? <Spinner size="sm" /> : stats?.activeItems ?? 0}
            </div>
          </div>
        </div>

        {/* Activity table (manual, not DataTable) */}
        <div className="bg-base-100 card-border card">
          <div className="card-body p-0">
            {error ? (
              <div className="alert alert-error m-4">
                <Icon icon="lucide--alert-circle" />
                <span>{error}</span>
              </div>
            ) : loading ? (
              <div className="flex justify-center py-8">
                <Spinner size="lg" />
              </div>
            ) : !stats?.recentActivity.length ? (
              <div className="text-center py-8 text-base-content/70">
                <Icon
                  icon="lucide--inbox"
                  className="size-12 mx-auto mb-2 opacity-50"
                />
                <p>No activity found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table table-zebra">
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>User</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentActivity.map((activity) => (
                      <tr key={activity.id}>
                        <td>{activity.action}</td>
                        <td>{activity.user}</td>
                        <td>{new Date(activity.time).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Pagination */}
        {stats && stats.recentActivity.length > 0 && (
          <div className="flex justify-center mt-4">
            <div className="join">
              <button
                className="join-item btn btn-sm"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <Icon icon="lucide--chevron-left" />
              </button>
              <button className="join-item btn btn-sm">Page {page}</button>
              <button
                className="join-item btn btn-sm"
                disabled={stats.recentActivity.length < pageSize}
                onClick={() => setPage((p) => p + 1)}
              >
                <Icon icon="lucide--chevron-right" />
              </button>
            </div>
          </div>
        )}
      </PageContainer>
    </OrgAndProjectGate>
  );
}
```

### Key Elements

| Element             | Purpose                             | Required |
| ------------------- | ----------------------------------- | -------- |
| `OrgAndProjectGate` | Ensure org/project selected         | Yes      |
| Filter controls     | Time range, status filters          | Yes      |
| Stats cards         | Key metrics at top                  | Yes      |
| Manual table        | Custom table layout (not DataTable) | Optional |
| Custom pagination   | Join-style page controls            | Optional |

---

## Pattern 4: Detail Page

Detail pages show comprehensive information about a single entity.

### Structure

```tsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { useConfig } from '@/contexts/config';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { PageContainer } from '@/components/layouts';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';

interface EntityDetail {
  id: string;
  name: string;
  status: string;
  created_at: string;
  metadata: Record<string, unknown>;
}

export default function EntityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { config } = useConfig();
  const { apiBase, fetchJson } = useApi();
  const { showToast } = useToast();

  const [entity, setEntity] = useState<EntityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'metadata'>('details');

  useEffect(() => {
    if (!id || !config.activeProjectId) return;

    const loadEntity = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchJson<EntityDetail>(
          `${apiBase}/api/entities/${id}`
        );
        setEntity(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    };

    loadEntity();
  }, [id, config.activeProjectId, apiBase, fetchJson]);

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this entity?')) return;

    try {
      await fetchJson(`${apiBase}/api/entities/${id}`, { method: 'DELETE' });
      showToast({ message: 'Entity deleted', variant: 'success' });
      navigate('/admin/entities');
    } catch (err) {
      showToast({ message: 'Failed to delete', variant: 'error' });
    }
  };

  if (loading) {
    return (
      <PageContainer maxWidth="4xl">
        <div className="flex items-center justify-center min-h-[400px]">
          <Spinner size="lg" />
        </div>
      </PageContainer>
    );
  }

  if (error || !entity) {
    return (
      <PageContainer maxWidth="4xl">
        <div className="alert alert-error">
          <Icon icon="lucide--alert-circle" />
          <span>{error || 'Entity not found'}</span>
        </div>
        <Link to="/admin/entities" className="btn btn-ghost mt-4">
          <Icon icon="lucide--arrow-left" />
          Back to list
        </Link>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="4xl" testId="page-entity-detail">
      {/* Breadcrumbs */}
      <div className="text-sm breadcrumbs">
        <ul>
          <li>
            <Link to="/admin">Admin</Link>
          </li>
          <li>
            <Link to="/admin/entities">Entities</Link>
          </li>
          <li>{entity.name}</li>
        </ul>
      </div>

      {/* Header with actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mt-4 mb-6">
        <div>
          <h1 className="font-bold text-2xl flex items-center gap-2">
            {entity.name}
            <span
              className={`badge badge-sm ${
                entity.status === 'active' ? 'badge-success' : 'badge-warning'
              }`}
            >
              {entity.status}
            </span>
          </h1>
          <p className="text-sm text-base-content/70">
            Created {new Date(entity.created_at).toLocaleDateString()}
          </p>
        </div>

        <div className="flex gap-2">
          <button className="btn btn-sm btn-ghost">
            <Icon icon="lucide--edit" />
            Edit
          </button>
          <button
            className="btn btn-sm btn-error btn-outline"
            onClick={handleDelete}
          >
            <Icon icon="lucide--trash-2" />
            Delete
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div role="tablist" className="tabs tabs-bordered mb-6">
        <button
          role="tab"
          className={`tab ${activeTab === 'details' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('details')}
        >
          Details
        </button>
        <button
          role="tab"
          className={`tab ${activeTab === 'metadata' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('metadata')}
        >
          Metadata
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'details' && (
        <div className="bg-base-100 card-border card">
          <div className="card-body">
            <h2 className="card-title">Entity Details</h2>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <dt className="text-sm text-base-content/70">ID</dt>
                <dd className="font-mono text-sm">{entity.id}</dd>
              </div>
              <div>
                <dt className="text-sm text-base-content/70">Name</dt>
                <dd>{entity.name}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}

      {activeTab === 'metadata' && (
        <div className="bg-base-100 card-border card">
          <div className="card-body">
            <h2 className="card-title">Metadata</h2>
            <pre className="bg-base-200 p-4 rounded-lg overflow-auto text-sm">
              {JSON.stringify(entity.metadata, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
```

---

## Layout Wrappers

### AdminLayout

Main app layout with sidebar, topbar, footer.

```tsx
// Used automatically via router for /admin/* routes
// Features:
// - Sidebar navigation
// - Topbar with user menu
// - Footer
// - OrgAndProjectGateRedirect for project-required routes
```

### SettingsLayout

Settings pages with sidebar navigation.

```tsx
// components/SettingsLayout.tsx
function SettingsLayout({ children }) {
  return (
    <div className="flex gap-6">
      <SettingsSidebar />
      <div className="flex-1">{children}</div>
    </div>
  );
}
```

### Auth Layout

Minimal layout for auth pages (login, register, etc.)

```tsx
// auth/layout.tsx - centered card on gradient background
```

---

## Common Page Elements

### Page Header

```tsx
<div className="mb-6">
  <h1 className="font-bold text-2xl inline-flex items-center gap-2">
    Page Title
    {!loading && (
      <span className="badge badge-ghost badge-lg font-normal">{count}</span>
    )}
  </h1>
  <p className="mt-1 text-base-content/70">Page description text</p>
</div>
```

### Project Gate

```tsx
// Option 1: Manual check
if (!config.activeProjectId) {
  return (
    <PageContainer>
      <div className="alert alert-warning">
        <Icon icon="lucide--alert-circle" />
        <span>Please select a project</span>
      </div>
    </PageContainer>
  );
}

// Option 2: OrgAndProjectGate wrapper
<OrgAndProjectGate>{/* Page content */}</OrgAndProjectGate>;
```

### Loading State

```tsx
if (loading) {
  return (
    <PageContainer maxWidth="4xl">
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size="lg" />
      </div>
    </PageContainer>
  );
}
```

### Error State

```tsx
if (error) {
  return (
    <PageContainer>
      <div className="alert alert-error">
        <Icon icon="lucide--alert-circle" />
        <span>{error}</span>
      </div>
    </PageContainer>
  );
}
```

---

## Common Imports

```tsx
// Contexts & Hooks (REQUIRED)
import { useConfig } from '@/contexts/config';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';

// Real-time updates (optional)
import { useDataUpdates } from '@/contexts/data-updates';

// Layout
import { PageContainer } from '@/components/layouts';

// Atoms
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';

// For list pages
import {
  DataTable,
  type ColumnDef,
  type FilterConfig,
} from '@/components/organisms/DataTable';

// For forms
import { FormField } from '@/components/molecules/FormField';

// For gated pages
import { OrgAndProjectGate } from '@/components/organisms/OrgAndProjectGate';

// Routing
import { useParams, useNavigate, Link, useSearchParams } from 'react-router';
```

---

## Anti-Patterns

| Anti-Pattern                          | Correct Approach                                  |
| ------------------------------------- | ------------------------------------------------- |
| Raw `fetch()` for API calls           | Use `useApi().fetchJson()`                        |
| Custom toast state                    | Use `useToast().showToast()`                      |
| Manual polling for updates            | Use `useDataUpdates()` for SSE subscriptions      |
| No project gate check                 | Always check `config.activeProjectId` or use gate |
| Creating custom loading spinners      | Use `<Spinner />` atom                            |
| Inline error handling without toast   | Show toast for user-facing errors                 |
| Hard-coded API URLs                   | Use `${apiBase}/api/...` from `useApi()`          |
| Manual pagination state for DataTable | DataTable handles pagination internally           |
| Creating new list components          | Use DataTable with appropriate columns/filters    |

---

## File Naming

```
pages/
├── admin/
│   └── pages/
│       ├── objects/
│       │   └── index.tsx          # ObjectsPage
│       ├── settings/
│       │   ├── index.tsx          # Settings index
│       │   └── project/
│       │       └── llm-settings.tsx
│       └── monitoring/
│           └── ChatSessionsListPage.tsx
├── auth/
│   ├── login/
│   │   └── index.tsx
│   └── layout.tsx
└── landing/
    └── index.tsx
```

- Use `index.tsx` for main route pages
- Use descriptive names for specific pages (e.g., `ChatSessionsListPage.tsx`)
- Group related pages in folders
