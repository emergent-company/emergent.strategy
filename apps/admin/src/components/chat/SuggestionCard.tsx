import { Icon } from '@/components/atoms/Icon';
import { Tooltip } from '@/components/atoms/Tooltip';
import type { RefinementSuggestion } from '@/types/object-refinement';

export interface SuggestionCardProps {
  suggestion: RefinementSuggestion;
  onApply?: () => void;
  onReject?: () => void;
}

/**
 * SuggestionCard - Displays an AI suggestion with accept/reject actions
 *
 * Features:
 * - Visual indicator for suggestion type (property change, relationship, rename)
 * - Status badges (pending, accepted, rejected)
 * - Detailed preview of the change
 * - Accept/reject action buttons
 */
export function SuggestionCard({
  suggestion,
  onApply,
  onReject,
}: SuggestionCardProps) {
  const isPending = suggestion.status === 'pending';
  const isAccepted = suggestion.status === 'accepted';
  const isRejected = suggestion.status === 'rejected';

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

  return (
    <div
      className={`rounded-lg border p-2 ${
        isAccepted
          ? 'bg-success/10 border-success/30'
          : isRejected
          ? 'bg-error/10 border-error/30 text-base-content/60'
          : 'bg-base-100 border-base-300'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 mb-1">
        <Icon
          icon={getTypeIcon()}
          className={`size-3.5 ${
            isAccepted
              ? 'text-success'
              : isRejected
              ? 'text-error'
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
      </div>

      {/* Explanation */}
      <p className="text-xs text-base-content/70 mb-1.5">
        {suggestion.explanation}
      </p>

      {/* Details Preview */}
      {suggestion.details && (
        <SuggestionDetailsPreview
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
            aria-label="Reject suggestion"
          >
            <Icon icon="lucide--x" className="size-3" />
            Reject
          </button>
          <button
            type="button"
            className="btn btn-success btn-xs gap-1"
            onClick={onApply}
            aria-label="Apply suggestion"
          >
            <Icon icon="lucide--check" className="size-3" />
            Apply
          </button>
        </div>
      )}
    </div>
  );
}

// --- Suggestion Details Preview ---

interface SuggestionDetailsPreviewProps {
  type: RefinementSuggestion['type'];
  details: Record<string, unknown>;
}

function SuggestionDetailsPreview({
  type,
  details,
}: SuggestionDetailsPreviewProps) {
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

/**
 * Get the full string representation of a value for tooltips
 */
function getFullValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

/**
 * Format a value for display, truncating if needed
 */
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
