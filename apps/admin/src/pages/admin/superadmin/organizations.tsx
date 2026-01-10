import { useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import { TableAvatarCell } from '@/components/molecules/TableAvatarCell/TableAvatarCell';
import {
  DataTable,
  type ColumnDef,
  type RowAction,
} from '@/components/organisms/DataTable';
import {
  useSuperadminOrgs,
  type SuperadminOrg,
} from '@/hooks/use-superadmin-orgs';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { ConfirmActionModal } from '@/components/organisms/ConfirmActionModal/ConfirmActionModal';

// Extend for DataTable compatibility (already has id)
type OrgRow = SuperadminOrg;

export default function SuperadminOrganizationsPage() {
  const { apiBase, fetchJson } = useApi();
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [orgToDelete, setOrgToDelete] = useState<OrgRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { organizations, meta, isLoading, error, refetch } = useSuperadminOrgs({
    page,
    limit: 20,
    search: searchQuery || undefined,
  });

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setPage(1);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  const handleDeleteClick = (org: OrgRow) => {
    setOrgToDelete(org);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!orgToDelete) return;

    setIsDeleting(true);
    try {
      const response = await fetchJson<{ success: boolean; message: string }>(
        `${apiBase}/api/superadmin/organizations/${orgToDelete.id}`,
        { method: 'DELETE' }
      );

      if (response.success) {
        showToast({
          variant: 'success',
          message: `Organization "${orgToDelete.name}" deleted successfully`,
        });
        refetch();
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to delete organization';
      showToast({
        variant: 'error',
        message: errorMessage,
      });
    } finally {
      setIsDeleting(false);
      setDeleteModalOpen(false);
      setOrgToDelete(null);
    }
  };

  const totalPages = meta?.totalPages ?? 0;

  // DataTable column definitions
  const columns: ColumnDef<OrgRow>[] = [
    {
      key: 'name',
      label: 'Organization',
      width: 'w-64',
      render: (org) => (
        <TableAvatarCell
          name={org.name}
          subtitle={`${org.id.slice(0, 8)}...`}
          size="sm"
        />
      ),
    },
    {
      key: 'memberCount',
      label: 'Members',
      sortable: true,
      render: (org) => (
        <div className="flex items-center gap-2">
          <Icon icon="lucide--users" className="size-4 text-base-content/50" />
          <span>{org.memberCount}</span>
        </div>
      ),
    },
    {
      key: 'projectCount',
      label: 'Projects',
      sortable: true,
      render: (org) => (
        <div className="flex items-center gap-2">
          <Icon icon="lucide--folder" className="size-4 text-base-content/50" />
          <span>{org.projectCount}</span>
        </div>
      ),
    },
    {
      key: 'createdAt',
      label: 'Created',
      sortable: true,
      render: (org) => formatDate(org.createdAt),
    },
    {
      key: 'status',
      label: 'Status',
      render: (org) =>
        org.deletedAt ? (
          <span className="badge badge-error badge-sm">Deleted</span>
        ) : (
          <span className="badge badge-success badge-sm">Active</span>
        ),
    },
  ];

  // DataTable row actions
  const rowActions: RowAction<OrgRow>[] = [
    {
      label: 'Delete',
      icon: 'lucide--trash-2',
      variant: 'error',
      onAction: handleDeleteClick,
      hidden: (org) => !!org.deletedAt,
    },
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Icon icon="lucide--building-2" className="size-6 text-primary" />
          <h1 className="text-2xl font-bold">Organizations</h1>
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

      <DataTable<OrgRow>
        data={organizations}
        columns={columns}
        loading={isLoading}
        error={error?.message}
        rowActions={rowActions}
        useDropdownActions
        enableSearch
        searchPlaceholder="Search by organization name..."
        onSearch={handleSearch}
        emptyMessage="No organizations found"
        noResultsMessage={
          searchQuery
            ? 'No organizations match your search. Try adjusting your search.'
            : 'No organizations found'
        }
        emptyIcon="lucide--building-2"
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
        paginationItemLabel="organizations"
      />

      {/* Delete Confirmation Modal */}
      <ConfirmActionModal
        open={deleteModalOpen}
        onCancel={() => {
          setDeleteModalOpen(false);
          setOrgToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Organization"
        description={`Are you sure you want to delete "${
          orgToDelete?.name ?? ''
        }"? This action cannot be undone.`}
        confirmVariant="error"
        confirmLabel="Delete"
        confirmLoading={isDeleting}
      />
    </div>
  );
}
