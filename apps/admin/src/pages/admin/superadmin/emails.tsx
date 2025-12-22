import { Icon } from '@/components/atoms/Icon';

export default function SuperadminEmailsPage() {
  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Icon icon="lucide--mail" className="size-6 text-primary" />
        <h1 className="text-2xl font-bold">Email History</h1>
      </div>
      <div className="card bg-base-100 shadow-sm border border-base-200">
        <div className="card-body">
          <p className="text-base-content/70">
            Email history viewer coming soon. You will be able to view all sent
            emails, filter by status and recipient, and preview email content.
          </p>
        </div>
      </div>
    </div>
  );
}
