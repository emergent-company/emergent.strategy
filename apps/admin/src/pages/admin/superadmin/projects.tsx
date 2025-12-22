import { Icon } from '@/components/atoms/Icon';

export default function SuperadminProjectsPage() {
  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Icon icon="lucide--folder" className="size-6 text-primary" />
        <h1 className="text-2xl font-bold">Projects</h1>
      </div>
      <div className="card bg-base-100 shadow-sm border border-base-200">
        <div className="card-body">
          <p className="text-base-content/70">
            Project browser coming soon. You will be able to view all projects
            with document counts and filter by organization.
          </p>
        </div>
      </div>
    </div>
  );
}
