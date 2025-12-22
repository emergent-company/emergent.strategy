import { useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import { useSuperadminOrgs } from '@/hooks/use-superadmin-orgs';

export default function SuperadminOrganizationsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);

  const { organizations, meta, isLoading, error, refetch } = useSuperadminOrgs({
    page,
    limit: 20,
    search: debouncedSearch || undefined,
  });

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (searchTimeout) clearTimeout(searchTimeout);
    const timeout = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
    setSearchTimeout(timeout);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  const totalPages = meta?.totalPages ?? 0;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Icon icon="lucide:building-2" className="size-6 text-primary" />
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
            <Icon icon="lucide:refresh-cw" className="size-4" />
          )}
          Refresh
        </button>
      </div>

      <div className="card bg-base-100 shadow-sm border border-base-200">
        <div className="card-body">
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="form-control flex-1">
              <label className="input input-bordered flex items-center gap-2">
                <Icon icon="lucide:search" className="size-4 opacity-50" />
                <input
                  type="text"
                  placeholder="Search by organization name..."
                  className="grow"
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                />
              </label>
            </div>
          </div>

          {error && (
            <div className="alert alert-error mb-4">
              <Icon icon="lucide:alert-circle" className="size-5" />
              <span>{error.message}</span>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="table table-zebra">
              <thead>
                <tr>
                  <th>Organization</th>
                  <th>Members</th>
                  <th>Projects</th>
                  <th>Created</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8">
                      <Spinner size="lg" />
                      <p className="mt-2 text-base-content/70">
                        Loading organizations...
                      </p>
                    </td>
                  </tr>
                ) : organizations.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8">
                      <p className="text-base-content/70">
                        No organizations found
                      </p>
                      {debouncedSearch && (
                        <p className="mt-1 text-sm text-base-content/50">
                          Try adjusting your search
                        </p>
                      )}
                    </td>
                  </tr>
                ) : (
                  organizations.map((org) => (
                    <tr key={org.id} className="hover">
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="avatar placeholder">
                            <div className="bg-primary text-primary-content rounded-lg w-10">
                              <Icon
                                icon="lucide:building-2"
                                className="size-5"
                              />
                            </div>
                          </div>
                          <div>
                            <div className="font-medium">{org.name}</div>
                            <div className="text-sm text-base-content/50 font-mono">
                              {org.id.slice(0, 8)}...
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <Icon
                            icon="lucide:users"
                            className="size-4 text-base-content/50"
                          />
                          <span>{org.memberCount}</span>
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <Icon
                            icon="lucide:folder"
                            className="size-4 text-base-content/50"
                          />
                          <span>{org.projectCount}</span>
                        </div>
                      </td>
                      <td>{formatDate(org.createdAt)}</td>
                      <td>
                        {org.deletedAt ? (
                          <span className="badge badge-error badge-sm">
                            Deleted
                          </span>
                        ) : (
                          <span className="badge badge-success badge-sm">
                            Active
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!isLoading && organizations.length > 0 && meta && (
            <div className="flex justify-between items-center mt-4">
              <div className="text-sm text-base-content/70">
                Showing {(page - 1) * meta.limit + 1} -{' '}
                {Math.min(page * meta.limit, meta.total)} of {meta.total}{' '}
                organizations
              </div>
              <div className="join">
                <button
                  className="join-item btn btn-sm"
                  onClick={() => setPage((p) => p - 1)}
                  disabled={!meta.hasPrev}
                >
                  «
                </button>
                <button className="join-item btn btn-sm">
                  Page {page} of {totalPages}
                </button>
                <button
                  className="join-item btn btn-sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!meta.hasNext}
                >
                  »
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
