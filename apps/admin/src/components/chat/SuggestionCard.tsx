import { Icon } from '@/components/atoms/Icon';
import { Tooltip } from '@/components/atoms/Tooltip';
import {
  type AnySuggestionType,
  type SuggestionStatus,
  type UnifiedSuggestion,
  isRefinementType,
  isMergeType,
  isSchemaType,
} from '@/types/suggestion';

// ============================================================================
// Props Interface
// ============================================================================

export interface SuggestionCardProps {
  /** The suggestion to display - supports refinement, merge, and schema types */
  suggestion: UnifiedSuggestion;
  /** Called when the user accepts the suggestion */
  onApply?: () => void;
  /** Called when the user rejects the suggestion */
  onReject?: () => void;
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * SuggestionCard - Unified component for displaying AI suggestions
 *
 * Supports three types of suggestions:
 * - Refinement: property changes, relationship edits, renames
 * - Merge: source/target value selection, combine, drop
 * - Schema: object type and relationship type modifications
 *
 * Features:
 * - Visual indicator for suggestion type (icon + label)
 * - Status badges (pending, accepted, rejected)
 * - Type-specific preview of the change
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

  const typeIcon = getTypeIcon(suggestion.type);
  const typeLabel = getTypeLabel(suggestion);
  const iconColorClass = getIconColorClass(suggestion.type, suggestion.status);

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
        <Icon icon={typeIcon} className={`size-3.5 ${iconColorClass}`} />
        <span className="text-xs font-medium">{typeLabel}</span>

        {/* Extra badge for merge (propertyKey) and schema (target_type) */}
        {isMergeType(suggestion.type) && suggestion.propertyKey && (
          <span className="badge badge-ghost badge-xs ml-1">
            {suggestion.propertyKey}
          </span>
        )}
        {isSchemaType(suggestion.type) && suggestion.target_type && (
          <span className="text-xs text-base-content/60 ml-1">
            {suggestion.target_type}
          </span>
        )}

        {/* Status badges */}
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

      {/* Explanation / Description */}
      <p className="text-xs text-base-content/70 mb-1.5">
        {suggestion.explanation || suggestion.description}
      </p>

      {/* Details Preview - type-specific rendering */}
      <SuggestionDetailsPreview suggestion={suggestion} />

      {/* Actions */}
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

// ============================================================================
// Icon & Label Helpers
// ============================================================================

function getTypeIcon(type: AnySuggestionType): string {
  // Refinement types
  if (type === 'property_change') return 'lucide--edit-3';
  if (type === 'relationship_add') return 'lucide--link';
  if (type === 'relationship_remove') return 'lucide--unlink';
  if (type === 'rename') return 'lucide--type';

  // Merge types
  if (type === 'keep_source') return 'lucide--arrow-left';
  if (type === 'keep_target') return 'lucide--arrow-right';
  if (type === 'combine') return 'lucide--combine';
  if (type === 'new_value') return 'lucide--sparkles';
  if (type === 'drop_property') return 'lucide--trash-2';
  if (type === 'property_merge') return 'lucide--git-merge';

  // Schema types
  if (type === 'add_object_type') return 'lucide--plus-square';
  if (type === 'modify_object_type') return 'lucide--edit-3';
  if (type === 'remove_object_type') return 'lucide--minus-square';
  if (type === 'add_relationship_type') return 'lucide--link';
  if (type === 'modify_relationship_type') return 'lucide--unlink-2';
  if (type === 'remove_relationship_type') return 'lucide--unlink';
  if (type === 'update_ui_config') return 'lucide--palette';
  if (type === 'update_extraction_prompt') return 'lucide--file-text';

  return 'lucide--sparkles';
}

function getTypeLabel(suggestion: UnifiedSuggestion): string {
  // Check for custom typeLabel in details (backwards compatibility)
  const customLabel = suggestion.details?.typeLabel as string | undefined;
  if (customLabel) return customLabel;

  const { type } = suggestion;

  // Refinement types
  if (type === 'property_change') return 'Property Change';
  if (type === 'relationship_add') return 'Add Relationship';
  if (type === 'relationship_remove') return 'Remove Relationship';
  if (type === 'rename') return 'Rename';

  // Merge types
  if (type === 'keep_source') return 'Keep Source';
  if (type === 'keep_target') return 'Keep Target';
  if (type === 'combine') return 'Combine';
  if (type === 'new_value') return 'New Value';
  if (type === 'drop_property') return 'Drop Property';
  if (type === 'property_merge') return 'Merge Property';

  // Schema types
  if (type === 'add_object_type') return 'Add Object Type';
  if (type === 'modify_object_type') return 'Modify Object Type';
  if (type === 'remove_object_type') return 'Remove Object Type';
  if (type === 'add_relationship_type') return 'Add Relationship';
  if (type === 'modify_relationship_type') return 'Modify Relationship';
  if (type === 'remove_relationship_type') return 'Remove Relationship';
  if (type === 'update_ui_config') return 'Update UI Config';
  if (type === 'update_extraction_prompt') return 'Update Extraction Prompt';

  return 'Suggestion';
}

function getIconColorClass(
  type: AnySuggestionType,
  status: SuggestionStatus
): string {
  if (status === 'accepted') return 'text-success';
  if (status === 'rejected') return 'text-error';

  // Use different accent colors based on category
  if (isMergeType(type)) return 'text-warning';
  if (isSchemaType(type)) return 'text-info';
  return 'text-primary'; // refinement
}

// ============================================================================
// Details Preview Component
// ============================================================================

interface SuggestionDetailsPreviewProps {
  suggestion: UnifiedSuggestion;
}

function SuggestionDetailsPreview({
  suggestion,
}: SuggestionDetailsPreviewProps) {
  const { type, details } = suggestion;

  // --- Refinement Types ---
  if (isRefinementType(type)) {
    return <RefinementDetailsPreview type={type} details={details || {}} />;
  }

  // --- Merge Types ---
  if (isMergeType(type)) {
    return <MergeDetailsPreview suggestion={suggestion} />;
  }

  // --- Schema Types ---
  if (isSchemaType(type)) {
    return <SchemaDetailsPreview suggestion={suggestion} />;
  }

  // Fallback: show raw details if present
  if (details && Object.keys(details).length > 0) {
    return (
      <div className="bg-base-200/50 rounded p-1.5 text-xs font-mono overflow-x-auto">
        <pre className="text-[10px]">{JSON.stringify(details, null, 2)}</pre>
      </div>
    );
  }

  return null;
}

// ============================================================================
// Refinement Details Preview
// ============================================================================

function RefinementDetailsPreview({
  type,
  details,
}: {
  type: string;
  details: Record<string, unknown>;
}) {
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

  return null;
}

// ============================================================================
// Merge Details Preview
// ============================================================================

function MergeDetailsPreview({
  suggestion,
}: {
  suggestion: UnifiedSuggestion;
}) {
  const { type, sourceValue, targetValue, suggestedValue } = suggestion;

  // Drop property has special rendering
  if (type === 'drop_property') {
    return (
      <div className="bg-base-200/50 rounded p-1.5 text-xs">
        <span className="text-error line-through">
          Property will be removed
        </span>
      </div>
    );
  }

  // Normal merge: show sourceValue → targetValue → suggestedValue
  return (
    <div className="bg-base-200/50 rounded p-1.5 text-xs">
      <div className="flex items-center gap-2 min-w-0 flex-wrap">
        {sourceValue !== undefined && (
          <span className="text-primary truncate" title={String(sourceValue)}>
            {formatPreviewValue(sourceValue)}
          </span>
        )}
        {sourceValue !== undefined && targetValue !== undefined && (
          <Icon
            icon="lucide--arrow-right"
            className="size-3 opacity-50 shrink-0"
          />
        )}
        {targetValue !== undefined && (
          <span className="text-secondary truncate" title={String(targetValue)}>
            {formatPreviewValue(targetValue)}
          </span>
        )}
        {suggestedValue !== undefined && (
          <>
            <Icon
              icon="lucide--chevron-right"
              className="size-3 opacity-50 shrink-0"
            />
            <span
              className="text-success font-medium truncate"
              title={String(suggestedValue)}
            >
              {formatPreviewValue(suggestedValue)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Schema Details Preview
// ============================================================================

function SchemaDetailsPreview({
  suggestion,
}: {
  suggestion: UnifiedSuggestion;
}) {
  const { before, after } = suggestion;

  if (!before && !after) return null;

  return (
    <div className="bg-base-200/50 rounded p-1.5 text-xs font-mono space-y-1">
      {before && (
        <div className="text-error/80">
          <span className="text-error font-medium">- </span>
          <span className="opacity-80">
            {truncateJson(JSON.stringify(before))}
          </span>
        </div>
      )}
      {after && (
        <div className="text-success/80">
          <span className="text-success font-medium">+ </span>
          <span className="opacity-80">
            {truncateJson(JSON.stringify(after))}
          </span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

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

/**
 * Truncate a JSON string for schema previews
 */
function truncateJson(json: string, maxLength = 80): string {
  return json.length > maxLength ? `${json.slice(0, maxLength)}...` : json;
}
