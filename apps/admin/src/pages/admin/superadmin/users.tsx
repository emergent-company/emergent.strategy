import { Icon } from '@/components/atoms/Icon';

export default function SuperadminUsersPage() {
  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Icon icon="lucide--users" className="size-6 text-primary" />
        <h1 className="text-2xl font-bold">Users</h1>
      </div>
      <div className="card bg-base-100 shadow-sm border border-base-200">
        <div className="card-body">
          <p className="text-base-content/70">
            User management coming soon. You will be able to view all users,
            their organization memberships, and last activity.
          </p>
        </div>
      </div>
    </div>
  );
}
