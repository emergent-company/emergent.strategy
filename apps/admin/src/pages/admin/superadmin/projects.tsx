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
  useSuperadminProjects,
  type SuperadminProject,
} from '@/hooks/use-superadmin-projects';
import { useSuperadminOrgs } from '@/hooks/use-superadmin-orgs';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { ConfirmActionModal } from '@/components/organisms/ConfirmActionModal/ConfirmActionModal';

type ProjectRow = SuperadminProject;

export default function SuperadminProjectsPage() {
  const { apiBase, fetchJson } = useApi();
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [orgIdFilter, setOrgIdFilter] = useState<string>('');

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<ProjectRow | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);

  const { organizations, isLoading: orgsLoading } = useSuperadminOrgs({
    limit: 100,
  });

  const { projects, meta, isLoading, error, refetch } = useSuperadminProjects({
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

  const handleDeleteClick = (project: ProjectRow) => {
    setProjectToDelete(project);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!projectToDelete) return;

    setIsDeleting(true);
    try {
      const response = await fetchJson<{ success: boolean; message: string }>(
        `${apiBase}/api/superadmin/projects/${projectToDelete.id}`,
        { method: 'DELETE' }
      );

      if (response.success) {
        showToast({
          variant: 'success',
          message: `Project "${projectToDelete.name}" deleted successfully`,
        });
        refetch();
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to delete project';
      showToast({
        variant: 'error',
        message: errorMessage,
      });
    } finally {
      setIsDeleting(false);
      setDeleteModalOpen(false);
      setProjectToDelete(null);
    }
  };

  const totalPages = meta?.totalPages ?? 0;

  const columns: ColumnDef<ProjectRow>[] = [
    {
      key: 'name',
      label: 'Project',
      width: 'w-64',
      render: (project) => (
        <TableAvatarCell
          name={project.name}
          subtitle={`${project.id.slice(0, 8)}...`}
          size="sm"
        />
      ),
    },
    {
      key: 'organizationName',
      label: 'Organization',
      sortable: true,
      render: (project) => (
        <div className="flex items-center gap-2">
          <Icon
            icon="lucide--building-2"
            className="size-4 text-base-content/50"
          />
          <span>{project.organizationName}</span>
        </div>
      ),
    },
    {
      key: 'documentCount',
      label: 'Documents',
      sortable: true,
      render: (project) => (
        <div className="flex items-center gap-2">
          <Icon
            icon="lucide--file-text"
            className="size-4 text-base-content/50"
          />
          <span>{project.documentCount}</span>
        </div>
      ),
    },
    {
      key: 'createdAt',
      label: 'Created',
      sortable: true,
      render: (project) => formatDate(project.createdAt),
    },
    {
      key: 'status',
      label: 'Status',
      render: (project) =>
        project.deletedAt ? (
          <span className="badge badge-error badge-sm">Deleted</span>
        ) : (
          <span className="badge badge-success badge-sm">Active</span>
        ),
    },
  ];

  const rowActions: RowAction<ProjectRow>[] = [
    {
      label: 'Delete',
      icon: 'lucide--trash-2',
      variant: 'error',
      onAction: handleDeleteClick,
      hidden: (project) => !!project.deletedAt,
    },
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Icon icon="lucide--folder" className="size-6 text-primary" />
          <h1 className="text-2xl font-bold">Projects</h1>
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

      <DataTable<ProjectRow>
        data={projects}
        columns={columns}
        loading={isLoading}
        error={error?.message}
        rowActions={rowActions}
        useDropdownActions
        enableSearch
        searchPlaceholder="Search by project name..."
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
                {org.name} ({org.projectCount})
              </option>
            ))}
          </select>
        }
        emptyMessage="No projects found"
        noResultsMessage={
          searchQuery || orgIdFilter
            ? 'No projects match your search criteria. Try adjusting your filters.'
            : 'No projects found'
        }
        emptyIcon="lucide--folder"
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
        paginationItemLabel="projects"
      />

      {/* Delete Confirmation Modal */}
      <ConfirmActionModal
        open={deleteModalOpen}
        onCancel={() => {
          setDeleteModalOpen(false);
          setProjectToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Project"
        description={`Are you sure you want to delete "${
          projectToDelete?.name ?? ''
        }"? This action cannot be undone.`}
        confirmVariant="error"
        confirmLabel="Delete"
        confirmLoading={isDeleting}
      />
    </div>
  );
}
