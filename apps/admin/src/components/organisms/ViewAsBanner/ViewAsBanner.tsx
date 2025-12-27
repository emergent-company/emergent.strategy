import { Icon } from '@/components/atoms/Icon';
import { useViewAs } from '@/contexts/view-as';

export function ViewAsBanner() {
  const { viewAsUser, isViewingAs, stopViewAs } = useViewAs();

  if (!isViewingAs || !viewAsUser) {
    return null;
  }

  return (
    <div className="bg-warning text-warning-content px-4 py-2 flex items-center justify-between sticky top-0 z-50">
      <div className="flex items-center gap-2">
        <Icon icon="lucide--eye" className="size-5" />
        <span className="font-medium">
          Viewing as:{' '}
          <span className="font-bold">{viewAsUser.displayName}</span>
          {viewAsUser.email && (
            <span className="opacity-80 ml-1">({viewAsUser.email})</span>
          )}
        </span>
      </div>
      <button
        onClick={stopViewAs}
        className="btn btn-sm btn-ghost hover:bg-warning-content/20"
      >
        <Icon icon="lucide--x" className="size-4" />
        Exit View As
      </button>
    </div>
  );
}
