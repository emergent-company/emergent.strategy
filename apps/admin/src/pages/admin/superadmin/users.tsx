import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import { useSuperadminUsers } from '@/hooks/use-superadmin-users';
import { useSuperadminOrgs } from '@/hooks/use-superadmin-orgs';
import { useViewAs } from '@/contexts/view-as';

export default function SuperadminUsersPage() {
  const navigate = useNavigate();
  const { startViewAs } = useViewAs();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [orgIdFilter, setOrgIdFilter] = useState<string>('');
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);

  const { organizations, isLoading: orgsLoading } = useSuperadminOrgs({
    limit: 100,
  });

  const { users, meta, isLoading, error, refetch } = useSuperadminUsers({
    page,
    limit: 20,
    search: debouncedSearch || undefined,
    orgId: orgIdFilter || undefined,
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

  const getUserDisplayName = (user: (typeof users)[0]) => {
    if (user.displayName) return user.displayName;
    if (user.firstName || user.lastName) {
      return [user.firstName, user.lastName].filter(Boolean).join(' ');
    }
    return user.primaryEmail || 'Unknown';
  };

  const totalPages = meta?.totalPages ?? 0;

  const handleViewAs = (user: (typeof users)[0]) => {
    const displayName = getUserDisplayName(user);
    startViewAs({
      id: user.id,
      displayName,
      email: user.primaryEmail || undefined,
    });
    navigate('/');
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Icon icon="lucide:users" className="size-6 text-primary" />
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
                  placeholder="Search by name or email..."
                  className="grow"
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                />
              </label>
            </div>
            <div className="form-control w-full sm:w-64">
              <select
                className="select select-bordered"
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
                  <th>User</th>
                  <th>Organizations</th>
                  <th>Last Activity</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8">
                      <Spinner size="lg" />
                      <p className="mt-2 text-base-content/70">
                        Loading users...
                      </p>
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8">
                      <p className="text-base-content/70">No users found</p>
                      {(debouncedSearch || orgIdFilter) && (
                        <p className="mt-1 text-sm text-base-content/50">
                          Try adjusting your filters
                        </p>
                      )}
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="hover">
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="avatar placeholder">
                            <div className="bg-neutral text-neutral-content rounded-full w-10">
                              <span className="text-sm">
                                {getUserDisplayName(user)
                                  .charAt(0)
                                  .toUpperCase()}
                              </span>
                            </div>
                          </div>
                          <div>
                            <div className="font-medium">
                              {getUserDisplayName(user)}
                            </div>
                            {user.primaryEmail && (
                              <div className="text-sm text-base-content/70">
                                {user.primaryEmail}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        {user.organizations.length === 0 ? (
                          <span className="text-base-content/50">None</span>
                        ) : (
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
                        )}
                      </td>
                      <td>
                        <span
                          className={
                            user.lastActivityAt ? '' : 'text-base-content/50'
                          }
                        >
                          {formatDateTime(user.lastActivityAt)}
                        </span>
                      </td>
                      <td>{formatDate(user.createdAt)}</td>
                      <td>
                        <button
                          className="btn btn-ghost btn-sm"
                          title="View as this user"
                          onClick={() => handleViewAs(user)}
                        >
                          <Icon icon="lucide:eye" className="size-4" />
                          View As
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!isLoading && users.length > 0 && meta && (
            <div className="flex justify-between items-center mt-4">
              <div className="text-sm text-base-content/70">
                Showing {(page - 1) * meta.limit + 1} -{' '}
                {Math.min(page * meta.limit, meta.total)} of {meta.total} users
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
