import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import { TableAvatarCell } from '@/components/molecules/TableAvatarCell/TableAvatarCell';
import {
  DataTable,
  type ColumnDef,
  type RowAction,
  type BulkAction,
} from '@/components/organisms/DataTable';
import { useSuperadminUsers } from '@/hooks/use-superadmin-users';
import { useSuperadminOrgs } from '@/hooks/use-superadmin-orgs';
import { useViewAs } from '@/contexts/view-as';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { ConfirmActionModal } from '@/components/organisms/ConfirmActionModal/ConfirmActionModal';
import type { SuperadminUser } from '@/types/superadmin';

// Extend SuperadminUser with id for DataTable compatibility
type UserRow = SuperadminUser & { id: string };

export default function SuperadminUsersPage() {
  const navigate = useNavigate();
  const { startViewAs } = useViewAs();
  const { apiBase, fetchJson } = useApi();
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [orgIdFilter, setOrgIdFilter] = useState<string>('');

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [usersToDelete, setUsersToDelete] = useState<UserRow[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  const { organizations, isLoading: orgsLoading } = useSuperadminOrgs({
    limit: 100,
  });

  const { users, meta, isLoading, error, refetch } = useSuperadminUsers({
    page,
    limit: 20,
    search: searchQuery || undefined,
    orgId: orgIdFilter || undefined,
  });

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setPage(1);
  };

  const handleOrgFilterChange = (orgId: string) => {
    setOrgIdFilter(orgId);
    setPage(1);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  };

  const getUserDisplayName = (user: UserRow) => {
    if (user.displayName) return user.displayName;
    if (user.firstName || user.lastName) {
      return [user.firstName, user.lastName].filter(Boolean).join(' ');
    }
    return user.primaryEmail || 'Unknown';
  };

  const totalPages = meta?.totalPages ?? 0;

  const handleViewAs = (user: UserRow) => {
    const displayName = getUserDisplayName(user);
    startViewAs({
      id: user.id,
      displayName,
      email: user.primaryEmail || undefined,
    });
    navigate('/');
  };

  const handleDeleteClick = (user: UserRow) => {
    setUsersToDelete([user]);
    setDeleteModalOpen(true);
  };

  const handleBulkDelete = (
    _selectedIds: string[],
    selectedItems: UserRow[]
  ) => {
    if (!selectedItems.length) return;
    setUsersToDelete(selectedItems);
    setTimeout(() => setDeleteModalOpen(true), 0);
  };

  const handleConfirmDelete = async () => {
    if (!usersToDelete.length) return;

    setIsDeleting(true);
    let successCount = 0;
    let failCount = 0;

    try {
      for (const user of usersToDelete) {
        try {
          const response = await fetchJson<{
            success: boolean;
            message: string;
          }>(`${apiBase}/api/superadmin/users/${user.id}`, {
            method: 'DELETE',
          });

          if (response.success) {
            successCount++;
          } else {
            failCount++;
          }
        } catch {
          failCount++;
        }
      }

      if (successCount > 0) {
        showToast({
          variant: 'success',
          message:
            usersToDelete.length === 1
              ? `User "${getUserDisplayName(
                  usersToDelete[0]
                )}" deleted successfully`
              : `${successCount} user${
                  successCount > 1 ? 's' : ''
                } deleted successfully`,
        });
        refetch();
      }

      if (failCount > 0) {
        showToast({
          variant: 'error',
          message: `Failed to delete ${failCount} user${
            failCount > 1 ? 's' : ''
          }`,
        });
      }
    } finally {
      setIsDeleting(false);
      setDeleteModalOpen(false);
      setUsersToDelete([]);
    }
  };

  // DataTable column definitions
  const columns: ColumnDef<UserRow>[] = [
    {
      key: 'user',
      label: 'User',
      width: 'w-64',
      render: (user) => (
        <TableAvatarCell
          name={getUserDisplayName(user)}
          subtitle={user.primaryEmail || undefined}
          rounded
          size="sm"
        />
      ),
    },
    {
      key: 'organizations',
      label: 'Organizations',
      render: (user) => {
        if (user.organizations.length === 0) {
          return <span className="text-base-content/50">None</span>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {user.organizations.slice(0, 2).map((org) => (
              <span
                key={org.orgId}
                className="badge badge-outline badge-sm"
                title={`${org.orgName} (${org.role})`}
              >
                {org.orgName}
              </span>
            ))}
            {user.organizations.length > 2 && (
              <span
                className="badge badge-ghost badge-sm"
                title={user.organizations
                  .slice(2)
                  .map((o) => o.orgName)
                  .join(', ')}
              >
                +{user.organizations.length - 2}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'lastActivityAt',
      label: 'Last Activity',
      sortable: true,
      render: (user) => (
        <span className={user.lastActivityAt ? '' : 'text-base-content/50'}>
          {formatDateTime(user.lastActivityAt)}
        </span>
      ),
    },
    {
      key: 'createdAt',
      label: 'Created',
      sortable: true,
      render: (user) => formatDate(user.createdAt),
    },
  ];

  // DataTable row actions
  const rowActions: RowAction<UserRow>[] = [
    {
      label: 'View As',
      icon: 'lucide--eye',
      onAction: handleViewAs,
    },
    {
      label: 'Delete',
      icon: 'lucide--trash-2',
      variant: 'error',
      onAction: handleDeleteClick,
    },
  ];

  // DataTable bulk actions
  const bulkActions: BulkAction<UserRow>[] = [
    {
      key: 'delete',
      label: 'Delete',
      icon: 'lucide--trash-2',
      variant: 'error',
      style: 'outline',
      onAction: handleBulkDelete,
    },
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Icon icon="lucide--users" className="size-6 text-primary" />
          <h1 className="text-2xl font-bold">Users</h1>
          {meta && (
            <span className="badge badge-ghost">{meta.total} total</span>
          )}
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          {isLoading ? (
            <Spinner size="sm" />
          ) : (
            <Icon icon="lucide--refresh-cw" className="size-4" />
          )}
          Refresh
        </button>
      </div>

      <DataTable<UserRow>
        data={users}
        columns={columns}
        loading={isLoading}
        error={error?.message}
        rowActions={rowActions}
        bulkActions={bulkActions}
        enableSelection
        useDropdownActions
        enableSearch
        searchPlaceholder="Search by name or email..."
        onSearch={handleSearch}
        toolbarActions={
          <select
            className="select select-bordered select-sm"
            value={orgIdFilter}
            onChange={(e) => handleOrgFilterChange(e.target.value)}
            disabled={orgsLoading}
          >
            <option value="">All Organizations</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name} ({org.memberCount})
              </option>
            ))}
          </select>
        }
        emptyMessage="No users found"
        noResultsMessage={
          searchQuery || orgIdFilter
            ? 'No users match your search criteria. Try adjusting your filters.'
            : 'No users found'
        }
        emptyIcon="lucide--users"
        pagination={
          meta
            ? {
                page,
                totalPages,
                total: meta.total,
                limit: meta.limit,
                hasPrev: meta.hasPrev,
                hasNext: meta.hasNext,
              }
            : undefined
        }
        onPageChange={setPage}
        paginationItemLabel="users"
      />

      {/* Delete Confirmation Modal */}
      <ConfirmActionModal
        open={deleteModalOpen}
        onCancel={() => {
          setDeleteModalOpen(false);
          setUsersToDelete([]);
        }}
        onConfirm={handleConfirmDelete}
        title={usersToDelete.length > 1 ? 'Delete Users' : 'Delete User'}
        description={
          usersToDelete.length > 1
            ? `Are you sure you want to delete ${usersToDelete.length} users? This action cannot be undone.`
            : `Are you sure you want to delete "${
                usersToDelete.length === 1
                  ? getUserDisplayName(usersToDelete[0])
                  : ''
              }"? This action cannot be undone.`
        }
        confirmVariant="error"
        confirmLabel="Delete"
        confirmLoading={isDeleting}
      />
    </div>
  );
}
