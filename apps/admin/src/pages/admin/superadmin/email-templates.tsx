import { useNavigate } from 'react-router';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import { DataTable, type ColumnDef } from '@/components/organisms/DataTable';
import {
  useSuperadminTemplates,
  type EmailTemplateListItem,
} from '@/hooks/use-superadmin-templates';

export default function SuperadminEmailTemplatesPage() {
  const navigate = useNavigate();
  const { templates, isLoading, error, refetch } = useSuperadminTemplates();

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const handleRowClick = (template: EmailTemplateListItem) => {
    navigate(`/admin/superadmin/email-templates/${template.id}`);
  };

  const columns: ColumnDef<EmailTemplateListItem>[] = [
    {
      key: 'name',
      label: 'Template',
      width: 'w-64',
      render: (template) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium">{template.name}</span>
          {template.description && (
            <span className="text-xs text-base-content/60 line-clamp-1">
              {template.description}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (template) => (
        <span
          className={`badge badge-sm ${
            template.isCustomized ? 'badge-primary' : 'badge-ghost'
          }`}
        >
          {template.isCustomized ? 'Customized' : 'Default'}
        </span>
      ),
    },
    {
      key: 'version',
      label: 'Version',
      render: (template) => (
        <span className="text-sm text-base-content/70">
          v{template.currentVersionNumber}
        </span>
      ),
    },
    {
      key: 'updatedAt',
      label: 'Last Updated',
      sortable: true,
      render: (template) => (
        <div className="flex flex-col gap-0.5">
          <span className="text-sm">{formatDateTime(template.updatedAt)}</span>
          {template.updatedBy && (
            <span className="text-xs text-base-content/50">
              by {template.updatedBy.name}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      label: '',
      width: 'w-12',
      render: () => (
        <Icon
          icon="lucide--chevron-right"
          className="size-4 text-base-content/40"
        />
      ),
    },
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Icon icon="lucide--file-code" className="size-6 text-primary" />
          <h1 className="text-2xl font-bold">Email Templates</h1>
          {templates.length > 0 && (
            <span className="badge badge-ghost">
              {templates.length} templates
            </span>
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

      <div className="mb-6">
        <p className="text-base-content/70">
          Manage email templates used for system notifications. Edit templates
          to customize the look and feel of emails sent to users.
        </p>
      </div>

      <DataTable<EmailTemplateListItem>
        data={templates}
        columns={columns}
        loading={isLoading}
        error={error?.message}
        onRowClick={handleRowClick}
        emptyMessage="No email templates found"
        noResultsMessage="No templates match your search"
        emptyIcon="lucide--file-code"
      />
    </div>
  );
}
