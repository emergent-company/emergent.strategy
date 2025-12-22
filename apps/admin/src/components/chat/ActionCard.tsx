import { Link } from 'react-router';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import { Tooltip } from '@/components/atoms/Tooltip';
import type { RefinementSuggestion } from '@/types/object-refinement';

/**
 * Target object context for an action
 */
export interface ActionTarget {
  objectId: string;
  objectName: string;
  objectType: string;
}

export interface ActionCardProps {
  suggestion: RefinementSuggestion;
  /** The target object this action applies to */
  target?: ActionTarget;
  onApply?: () => void;
  onReject?: () => void;
  /** Whether an action is currently being processed */
  isLoading?: boolean;
}

/**
 * ActionCard - A self-contained action widget with object context
 *
 * Features:
 * - Shows which object the action targets (with link to object)
 * - Visual indicator for action type (property change, relationship, rename)
 * - Status badges (pending, accepted, rejected)
 * - Detailed preview of the change (old → new values)
 * - Accept/reject action buttons
 *
 * Use this when displaying suggestions in a context where multiple objects
 * may be discussed (e.g., chat-sdk page with mixed conversations).
 */
export function ActionCard({
  suggestion,
  target,
  onApply,
  onReject,
  isLoading = false,
}: ActionCardProps) {
  const isPending = suggestion.status === 'pending';
  const isAccepted = suggestion.status === 'accepted';
  const isRejected = suggestion.status === 'rejected';
  const isOutdated = suggestion.status === 'outdated';

  const getTypeIcon = () => {
    switch (suggestion.type) {
      case 'property_change':
        return 'lucide--edit-3';
      case 'relationship_add':
        return 'lucide--link';
      case 'relationship_remove':
        return 'lucide--unlink';
      case 'rename':
        return 'lucide--type';
      default:
        return 'lucide--sparkles';
    }
  };

  const getTypeLabel = () => {
    switch (suggestion.type) {
      case 'property_change':
        return 'Property Change';
      case 'relationship_add':
        return 'Add Relationship';
      case 'relationship_remove':
        return 'Remove Relationship';
      case 'rename':
        return 'Rename';
      default:
        return 'Suggestion';
    }
  };

  const getObjectTypeIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'person':
        return 'lucide--user';
      case 'place':
      case 'location':
        return 'lucide--map-pin';
      case 'event':
        return 'lucide--calendar';
      case 'organization':
      case 'group':
        return 'lucide--users';
      case 'concept':
        return 'lucide--lightbulb';
      case 'document':
        return 'lucide--file-text';
      default:
        return 'lucide--box';
    }
  };

  return (
    <div
      className={`rounded-lg border p-2 ${
        isAccepted
          ? 'bg-success/10 border-success/30'
          : isRejected
          ? 'bg-error/10 border-error/30 text-base-content/60'
          : isOutdated
          ? 'bg-warning/10 border-warning/30 text-base-content/50 opacity-75'
          : 'bg-base-100 border-base-300'
      }`}
    >
      {/* Target Object Context - only show if target is provided */}
      {target && (
        <div className="flex items-center gap-1.5 mb-2 pb-2 border-b border-base-300/50">
          <Icon
            icon={getObjectTypeIcon(target.objectType)}
            className="size-3.5 text-base-content/50"
          />
          <Link
            to={`/admin/objects?id=${target.objectId}`}
            className="text-xs font-medium text-primary hover:underline truncate"
            title={`View ${target.objectName}`}
          >
            {target.objectName}
          </Link>
          <span className="text-xs text-base-content/40">
            ({target.objectType})
          </span>
        </div>
      )}

      {/* Action Header */}
      <div className="flex items-center gap-1.5 mb-1">
        <Icon
          icon={getTypeIcon()}
          className={`size-3.5 ${
            isAccepted
              ? 'text-success'
              : isRejected
              ? 'text-error'
              : isOutdated
              ? 'text-warning'
              : 'text-primary'
          }`}
        />
        <span className="text-xs font-medium">{getTypeLabel()}</span>
        {isAccepted && (
          <span className="badge badge-success badge-xs gap-1 ml-auto">
            <Icon icon="lucide--check" className="size-2.5" />
            Applied
          </span>
        )}
        {isRejected && (
          <span className="badge badge-error badge-xs gap-1 ml-auto">
            <Icon icon="lucide--x" className="size-2.5" />
            Rejected
          </span>
        )}
        {isOutdated && (
          <span className="badge badge-warning badge-xs gap-1 ml-auto">
            <Icon icon="lucide--clock" className="size-2.5" />
            Outdated
          </span>
        )}
      </div>

      {/* Explanation */}
      <p className="text-xs text-base-content/70 mb-1.5">
        {suggestion.explanation}
      </p>

      {/* Details Preview */}
      {suggestion.details && (
        <ActionDetailsPreview
          type={suggestion.type}
          details={suggestion.details}
        />
      )}

      {/* Actions - bottom right */}
      {isPending && onApply && onReject && (
        <div className="flex items-center justify-end gap-2 mt-2">
          <button
            type="button"
            className="btn btn-ghost btn-xs gap-1"
            onClick={onReject}
            disabled={isLoading}
            aria-label="Reject suggestion"
          >
            {isLoading ? (
              <Spinner size="xs" />
            ) : (
              <Icon icon="lucide--x" className="size-3" />
            )}
            Reject
          </button>
          <button
            type="button"
            className="btn btn-success btn-xs gap-1"
            onClick={onApply}
            disabled={isLoading}
            aria-label="Apply suggestion"
          >
            {isLoading ? (
              <Spinner size="xs" />
            ) : (
              <Icon icon="lucide--check" className="size-3" />
            )}
            Apply
          </button>
        </div>
      )}
    </div>
  );
}

// --- Action Details Preview ---

interface ActionDetailsPreviewProps {
  type: RefinementSuggestion['type'];
  details: Record<string, unknown>;
}

function ActionDetailsPreview({ type, details }: ActionDetailsPreviewProps) {
  if (type === 'property_change') {
    const { propertyKey, oldValue, newValue } = details as {
      propertyKey?: string;
      oldValue?: unknown;
      newValue?: unknown;
    };
    const fullOldValue = getFullValue(oldValue);
    const fullNewValue = getFullValue(newValue);
    const oldValueTruncated = formatPreviewValue(oldValue);
    const newValueTruncated = formatPreviewValue(newValue);
    const showOldTooltip = fullOldValue !== oldValueTruncated;
    const showNewTooltip = fullNewValue !== newValueTruncated;

    return (
      <div className="bg-base-200/50 rounded p-1.5 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-base-content/60 shrink-0">
            {propertyKey || 'property'}
          </span>
          {oldValue !== undefined &&
            (showOldTooltip ? (
              <Tooltip
                content={fullOldValue}
                placement="bottom"
                className="min-w-0 shrink overflow-visible"
              >
                <span className="text-error line-through truncate block cursor-help">
                  {oldValueTruncated}
                </span>
              </Tooltip>
            ) : (
              <span className="text-error line-through truncate min-w-0">
                {oldValueTruncated}
              </span>
            ))}
          {oldValue !== undefined && newValue !== undefined && (
            <Icon
              icon="lucide--arrow-right"
              className="size-3 opacity-50 shrink-0"
            />
          )}
          {newValue !== undefined &&
            (showNewTooltip ? (
              <Tooltip
                content={fullNewValue}
                placement="bottom"
                className="min-w-0 shrink overflow-visible"
              >
                <span className="text-success truncate block cursor-help">
                  {newValueTruncated}
                </span>
              </Tooltip>
            ) : (
              <span className="text-success truncate min-w-0">
                {newValueTruncated}
              </span>
            ))}
        </div>
      </div>
    );
  }

  if (type === 'relationship_add') {
    const { relationshipType, targetObjectName } = details as {
      relationshipType?: string;
      targetObjectName?: string;
    };
    return (
      <div className="bg-base-200/50 rounded p-1.5 text-xs">
        <div className="flex items-center gap-1">
          <span className="text-success">+</span>
          <span className="font-medium">
            {relationshipType || 'relates_to'}
          </span>
          <Icon icon="lucide--arrow-right" className="size-3 opacity-50" />
          <span>{targetObjectName || 'Object'}</span>
        </div>
      </div>
    );
  }

  if (type === 'relationship_remove') {
    const { relationshipType } = details as {
      relationshipType?: string;
    };
    return (
      <div className="bg-base-200/50 rounded p-1.5 text-xs">
        <div className="flex items-center gap-1">
          <span className="text-error">-</span>
          <span className="font-medium line-through">
            {relationshipType || 'relationship'}
          </span>
        </div>
      </div>
    );
  }

  if (type === 'rename') {
    const { oldName, newName } = details as {
      oldName?: string;
      newName?: string;
    };
    return (
      <div className="bg-base-200/50 rounded p-1.5 text-xs">
        <div className="flex items-center gap-2">
          {oldName && (
            <span className="text-error line-through">{oldName}</span>
          )}
          <Icon icon="lucide--arrow-right" className="size-3 opacity-50" />
          {newName && <span className="text-success">{newName}</span>}
        </div>
      </div>
    );
  }

  // Fallback: show raw details
  return (
    <div className="bg-base-200/50 rounded p-1.5 text-xs font-mono overflow-x-auto">
      <pre className="text-[10px]">{JSON.stringify(details, null, 2)}</pre>
    </div>
  );
}

// --- Helper Functions ---

function getFullValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function formatPreviewValue(value: unknown, maxLength = 50): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') {
    return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
  }
  if (typeof value === 'object') {
    const str = JSON.stringify(value);
    return str.length > maxLength ? `${str.slice(0, maxLength)}...` : str;
  }
  return String(value);
}
