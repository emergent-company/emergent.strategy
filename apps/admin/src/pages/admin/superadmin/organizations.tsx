import { Icon } from '@/components/atoms/Icon';

export default function SuperadminOrganizationsPage() {
  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Icon icon="lucide--building-2" className="size-6 text-primary" />
        <h1 className="text-2xl font-bold">Organizations</h1>
      </div>
      <div className="card bg-base-100 shadow-sm border border-base-200">
        <div className="card-body">
          <p className="text-base-content/70">
            Organization browser coming soon. You will be able to view all
            organizations with member and project counts.
          </p>
        </div>
      </div>
    </div>
  );
}
