import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';

export interface ImportProgressProps {
  syncing: boolean;
  importedCount?: number;
  totalCount?: number;
  lastAction?: string;
}

export function ImportProgress({
  syncing,
  importedCount,
  totalCount,
  lastAction,
}: ImportProgressProps) {
  const percentComplete =
    totalCount && totalCount > 0
      ? Math.round(((importedCount ?? 0) / totalCount) * 100)
      : null;

  return (
    <div className="flex flex-col justify-center items-center gap-5 py-16">
      <div className="relative">
        <Spinner size="lg" className="text-primary" aria-hidden />
        <span className="sr-only">
          {syncing ? 'Import in progress' : 'Preparing import'}
        </span>
      </div>
      <div className="space-y-2 text-center">
        <p className="font-semibold text-lg">
          {syncing
            ? 'Importing ClickUp workspace data…'
            : 'Preparing import session…'}
        </p>
        <p className="max-w-md text-sm text-base-content/60">
          We’re pulling tasks, attachments, and metadata into Spec. You can
          close this modal safely — we’ll notify you when everything is ready.
        </p>
      </div>
      <div className="flex sm:flex-row flex-col sm:items-center gap-4 text-sm text-base-content/70">
        <div className="flex items-center gap-3 bg-base-200/80 px-4 py-3 rounded-lg">
          <Icon icon="lucide--external-link" className="size-4 text-primary" />
          <div className="text-left">
            <div className="font-medium text-base-content">
              Live Workspace Sync
            </div>
            <div>
              {percentComplete !== null
                ? `${
                    importedCount ?? 0
                  } of ${totalCount} items imported (${percentComplete}%)`
                : 'Estimating remaining items…'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-base-content/60">
          <Icon icon="lucide--clock" className="size-4" />
          <span>
            {lastAction
              ? `Last action: ${lastAction}`
              : syncing
              ? 'Queuing next batch…'
              : 'Starting jobs…'}
          </span>
        </div>
      </div>
    </div>
  );
}
