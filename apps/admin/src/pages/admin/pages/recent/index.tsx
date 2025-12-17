// Page: Recent Items
// Route: /admin/recent

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useConfig } from '@/contexts/config';
import { useApi } from '@/hooks/use-api';
import { Icon } from '@/components/atoms/Icon';
import { PageContainer } from '@/components/layouts';
import {
  createUserActivityClient,
  type RecentItem,
  type RecentItemsResponse,
} from '@/api/user-activity';
import { formatRelativeTime } from '@/lib/format-relative-time';

/**
 * Recent Items Page
 *
 * Displays the user's recently accessed objects and documents in two tables.
 * - Objects table (top): Name, Type, Status, Relationships, Last Accessed
 * - Documents table (below): Name, Type (MIME), Chunks, Extraction Status, Last Accessed
 *
 * Features:
 * - 10 items per table max, no pagination
 * - Row click navigates to resource detail
 * - "Last Accessed" column shows relative time + action badge (viewed/edited)
 * - Empty state when no recent items
 * - Loading states for each table
 */
export default function RecentItemsPage() {
  const navigate = useNavigate();
  const { config } = useConfig();
  const { apiBase, fetchJson } = useApi();

  const [recentItems, setRecentItems] = useState<RecentItemsResponse | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRecentItems = useCallback(async () => {
    if (!config.activeProjectId) return;

    setLoading(true);
    setError(null);

    try {
      const client = createUserActivityClient(apiBase, fetchJson);
      const data = await client.getRecentItems();
      setRecentItems(data);
    } catch (err) {
      console.error('Failed to load recent items:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to load recent items'
      );
    } finally {
      setLoading(false);
    }
  }, [config.activeProjectId, apiBase, fetchJson]);

  useEffect(() => {
    loadRecentItems();
  }, [loadRecentItems]);

  const handleObjectClick = (item: RecentItem) => {
    navigate(`/admin/objects?id=${item.resourceId}`);
  };

  const handleDocumentClick = (item: RecentItem) => {
    navigate(`/admin/apps/documents#${item.resourceId}`);
  };

  const handleClearAll = async () => {
    if (!confirm('Clear all recent items? This cannot be undone.')) return;

    try {
      const client = createUserActivityClient(apiBase, fetchJson);
      await client.clearAllRecentItems();
      setRecentItems({ objects: [], documents: [] });
    } catch (err) {
      console.error('Failed to clear recent items:', err);
    }
  };

  if (!config.activeProjectId) {
    return (
      <PageContainer>
        <div className="alert alert-warning">
          <Icon icon="lucide--alert-triangle" className="size-5" />
          <span>Please select a project to view recent items</span>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="full" className="px-4" testId="page-recent">
      {/* Header */}
      <div className="mb-6 flex justify-between items-start">
        <div>
          <h1 className="font-bold text-2xl">Recent Items</h1>
          <p className="mt-1 text-base-content/70">
            Your recently viewed and edited objects and documents
          </p>
        </div>
        {recentItems &&
          (recentItems.objects.length > 0 ||
            recentItems.documents.length > 0) && (
            <button
              onClick={handleClearAll}
              className="btn btn-ghost btn-sm text-base-content/70"
            >
              <Icon icon="lucide--trash-2" className="size-4" />
              Clear All
            </button>
          )}
      </div>

      {/* Error State */}
      {error && (
        <div className="alert alert-error mb-6">
          <Icon icon="lucide--alert-circle" className="size-5" />
          <span>{error}</span>
          <button onClick={loadRecentItems} className="btn btn-sm btn-ghost">
            Retry
          </button>
        </div>
      )}

      {/* Recent Objects Table */}
      <div className="mb-8">
        <h2 className="font-semibold text-lg mb-3 flex items-center gap-2">
          <Icon icon="lucide--box" className="size-5" />
          Recent Objects
          {!loading && recentItems && (
            <span className="badge badge-ghost badge-sm">
              {recentItems.objects.length}
            </span>
          )}
        </h2>
        <RecentObjectsTable
          items={recentItems?.objects || []}
          loading={loading}
          onRowClick={handleObjectClick}
        />
      </div>

      {/* Recent Documents Table */}
      <div>
        <h2 className="font-semibold text-lg mb-3 flex items-center gap-2">
          <Icon icon="lucide--file-text" className="size-5" />
          Recent Documents
          {!loading && recentItems && (
            <span className="badge badge-ghost badge-sm">
              {recentItems.documents.length}
            </span>
          )}
        </h2>
        <RecentDocumentsTable
          items={recentItems?.documents || []}
          loading={loading}
          onRowClick={handleDocumentClick}
        />
      </div>
    </PageContainer>
  );
}

/**
 * Recent Objects Table Component
 */
interface RecentObjectsTableProps {
  items: RecentItem[];
  loading: boolean;
  onRowClick: (item: RecentItem) => void;
}

function RecentObjectsTable({
  items,
  loading,
  onRowClick,
}: RecentObjectsTableProps) {
  if (loading) {
    return <TableSkeleton columns={4} rows={3} />;
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon="lucide--box"
        message="No recent objects"
        description="Objects you view or edit will appear here"
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="table table-zebra w-full">
        <thead>
          <tr>
            <th>Type</th>
            <th>Name</th>
            <th className="text-right">Last Accessed</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              className="hover cursor-pointer"
              onClick={() => onRowClick(item)}
            >
              <td>
                {item.resourceSubtype ? (
                  <span className="badge badge-sm badge-ghost">
                    {item.resourceSubtype}
                  </span>
                ) : (
                  <span className="text-base-content/50">—</span>
                )}
              </td>
              <td className="max-w-[300px]">
                <span className="font-medium truncate block">
                  {item.resourceName || `Object ${item.resourceId.slice(0, 8)}`}
                </span>
              </td>
              <td className="text-right">
                <LastAccessedCell
                  accessedAt={item.accessedAt}
                  actionType={item.actionType}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Recent Documents Table Component
 */
interface RecentDocumentsTableProps {
  items: RecentItem[];
  loading: boolean;
  onRowClick: (item: RecentItem) => void;
}

function RecentDocumentsTable({
  items,
  loading,
  onRowClick,
}: RecentDocumentsTableProps) {
  if (loading) {
    return <TableSkeleton columns={3} rows={3} />;
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon="lucide--file-text"
        message="No recent documents"
        description="Documents you view or edit will appear here"
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="table table-zebra w-full">
        <thead>
          <tr>
            <th>Type</th>
            <th>Name</th>
            <th className="text-right">Last Accessed</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              className="hover cursor-pointer"
              onClick={() => onRowClick(item)}
            >
              <td>
                {item.resourceSubtype ? (
                  <MimeTypeBadge mimeType={item.resourceSubtype} />
                ) : (
                  <span className="text-base-content/50">—</span>
                )}
              </td>
              <td className="max-w-[300px]">
                <span className="font-medium truncate block">
                  {item.resourceName ||
                    `Document ${item.resourceId.slice(0, 8)}`}
                </span>
              </td>
              <td className="text-right">
                <LastAccessedCell
                  accessedAt={item.accessedAt}
                  actionType={item.actionType}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Last Accessed Cell Component
 * Shows relative time + action badge (viewed/edited)
 */
interface LastAccessedCellProps {
  accessedAt: string;
  actionType: 'viewed' | 'edited';
}

function LastAccessedCell({ accessedAt, actionType }: LastAccessedCellProps) {
  const relativeTime = formatRelativeTime(accessedAt);

  return (
    <div className="flex items-center justify-end gap-2">
      <span className="text-sm text-base-content/70">{relativeTime}</span>
      <span
        className={`badge badge-xs ${
          actionType === 'edited' ? 'badge-primary' : 'badge-ghost'
        }`}
      >
        {actionType}
      </span>
    </div>
  );
}

/**
 * MIME Type Badge Component
 * Displays a human-friendly label for common MIME types
 */
interface MimeTypeBadgeProps {
  mimeType: string;
}

function MimeTypeBadge({ mimeType }: MimeTypeBadgeProps) {
  const label = getMimeTypeLabel(mimeType);
  return <span className="badge badge-sm badge-ghost">{label}</span>;
}

function getMimeTypeLabel(mimeType: string): string {
  const mimeLabels: Record<string, string> = {
    'application/pdf': 'PDF',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      'Word',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      'PowerPoint',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      'Excel',
    'text/plain': 'Text',
    'text/markdown': 'Markdown',
    'text/html': 'HTML',
  };

  return mimeLabels[mimeType] || mimeType.split('/').pop() || mimeType;
}

/**
 * Empty State Component
 */
interface EmptyStateProps {
  icon: string;
  message: string;
  description: string;
}

function EmptyState({ icon, message, description }: EmptyStateProps) {
  return (
    <div className="bg-base-200/50 rounded-box p-8 text-center">
      <Icon icon={icon} className="size-12 mx-auto text-base-content/30 mb-3" />
      <p className="text-base-content/70 font-medium">{message}</p>
      <p className="text-sm text-base-content/50 mt-1">{description}</p>
    </div>
  );
}

/**
 * Table Skeleton Component
 */
interface TableSkeletonProps {
  columns: number;
  rows: number;
}

function TableSkeleton({ columns, rows }: TableSkeletonProps) {
  return (
    <div className="overflow-x-auto">
      <table className="table w-full">
        <thead>
          <tr>
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i}>
                <div className="skeleton h-4 w-20"></div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, rowIdx) => (
            <tr key={rowIdx}>
              {Array.from({ length: columns }).map((_, colIdx) => (
                <td key={colIdx}>
                  <div className="skeleton h-4 w-full max-w-[200px]"></div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
