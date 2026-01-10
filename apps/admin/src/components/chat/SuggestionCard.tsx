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
  const { type, before, after } = suggestion;

  // Determine if this is an add, modify, or remove operation
  const isAdd = type.startsWith('add_');
  const isRemove = type.startsWith('remove_');
  const isModify = type.startsWith('modify_') || type.startsWith('update_');

  // For add operations: show only the "after" state in green
  if (isAdd && after) {
    return (
      <div className="bg-success/10 border border-success/30 rounded-lg p-2">
        <div className="flex items-center gap-1.5 mb-2">
          <Icon icon="lucide--plus" className="size-3.5 text-success" />
          <span className="text-xs font-medium text-success">Adding</span>
        </div>
        <SchemaPropertiesDisplay
          schema={after as Record<string, unknown>}
          variant="add"
        />
      </div>
    );
  }

  // For remove operations: show the "before" state in red
  if (isRemove && before) {
    return (
      <div className="bg-error/10 border border-error/30 rounded-lg p-2">
        <div className="flex items-center gap-1.5 mb-2">
          <Icon icon="lucide--minus" className="size-3.5 text-error" />
          <span className="text-xs font-medium text-error">Removing</span>
        </div>
        <SchemaPropertiesDisplay
          schema={before as Record<string, unknown>}
          variant="remove"
        />
      </div>
    );
  }

  // For modify operations: show side-by-side comparison (or just after if before is empty)
  if (isModify && (before || after)) {
    // If before is empty, just show the "after" state without side-by-side
    if (!before && after) {
      return (
        <div className="bg-success/10 border border-success/30 rounded-lg p-2">
          <div className="flex items-center gap-1.5 mb-2">
            <Icon icon="lucide--plus" className="size-3.5 text-success" />
            <span className="text-xs font-medium text-success">New Value</span>
          </div>
          <SchemaPropertiesDisplay
            schema={after as Record<string, unknown>}
            variant="add"
          />
        </div>
      );
    }

    // Side-by-side comparison when both exist - only show changed fields
    // Check if the "before" panel has any changes to show
    const beforeHasChanges = hasSchemaChanges(
      before as Record<string, unknown>,
      after as Record<string, unknown>
    );

    // If before has no changes (only additions in after), show only after panel
    if (!beforeHasChanges) {
      return (
        <div className="bg-success/10 border border-success/30 rounded-lg p-2">
          <div className="flex items-center gap-1.5 mb-2">
            <Icon icon="lucide--plus" className="size-3.5 text-success" />
            <span className="text-xs font-medium text-success">Changes</span>
          </div>
          <SchemaPropertiesDisplay
            schema={after as Record<string, unknown>}
            variant="add"
            compareWith={before as Record<string, unknown>}
            showOnlyChanges
          />
        </div>
      );
    }

    return (
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}
      >
        {/* Before (red) - only changed fields */}
        <div className="bg-error/10 border border-error/30 rounded-lg p-2">
          <div className="flex items-center gap-1.5 mb-2">
            <Icon icon="lucide--minus" className="size-3.5 text-error" />
            <span className="text-xs font-medium text-error">Before</span>
          </div>
          <SchemaPropertiesDisplay
            schema={before as Record<string, unknown>}
            variant="remove"
            compareWith={after as Record<string, unknown> | undefined}
            showOnlyChanges
          />
        </div>

        {/* After (green) - only changed fields */}
        <div className="bg-success/10 border border-success/30 rounded-lg p-2">
          <div className="flex items-center gap-1.5 mb-2">
            <Icon icon="lucide--plus" className="size-3.5 text-success" />
            <span className="text-xs font-medium text-success">After</span>
          </div>
          {after ? (
            <SchemaPropertiesDisplay
              schema={after as Record<string, unknown>}
              variant="add"
              compareWith={before as Record<string, unknown> | undefined}
              showOnlyChanges
            />
          ) : (
            <span className="text-xs text-base-content/50 italic">Empty</span>
          )}
        </div>
      </div>
    );
  }

  // Fallback: if we have before or after but couldn't categorize
  if (before || after) {
    // If both exist, show only changes like modify operations
    const hasBoth = !!(before && after);
    return (
      <div className="space-y-2">
        {before && (
          <div className="bg-error/10 border border-error/30 rounded-lg p-2">
            <div className="flex items-center gap-1.5 mb-2">
              <Icon icon="lucide--minus" className="size-3.5 text-error" />
              <span className="text-xs font-medium text-error">Before</span>
            </div>
            <SchemaPropertiesDisplay
              schema={before as Record<string, unknown>}
              variant="remove"
              compareWith={
                hasBoth ? (after as Record<string, unknown>) : undefined
              }
              showOnlyChanges={hasBoth}
            />
          </div>
        )}
        {after && (
          <div className="bg-success/10 border border-success/30 rounded-lg p-2">
            <div className="flex items-center gap-1.5 mb-2">
              <Icon icon="lucide--plus" className="size-3.5 text-success" />
              <span className="text-xs font-medium text-success">After</span>
            </div>
            <SchemaPropertiesDisplay
              schema={after as Record<string, unknown>}
              variant="add"
              compareWith={
                hasBoth ? (before as Record<string, unknown>) : undefined
              }
              showOnlyChanges={hasBoth}
            />
          </div>
        )}
      </div>
    );
  }

  return null;
}

// ============================================================================
// Schema Properties Display
// ============================================================================

interface SchemaPropertiesDisplayProps {
  schema: Record<string, unknown>;
  variant: 'add' | 'remove';
  compareWith?: Record<string, unknown>;
  /** When true, only show fields that differ from compareWith (for modify operations) */
  showOnlyChanges?: boolean;
}

/**
 * Deep equality check for JSON-serializable values
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return a === b;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }

  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);

  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(
    (key) => bKeys.includes(key) && deepEqual(aObj[key], bObj[key])
  );
}

/**
 * Check if a schema has any changes when compared to another schema (for showOnlyChanges mode)
 * Returns true if there are differences to display
 */
function hasSchemaChanges(
  schema: Record<string, unknown>,
  compareWith: Record<string, unknown>
): boolean {
  const properties = schema.properties as Record<string, unknown> | undefined;
  const description = schema.description as string | undefined;

  // Check UI config
  const uiConfig = schema.ui_config as Record<string, unknown> | undefined;
  const icon = (uiConfig?.icon || schema.icon) as string | undefined;
  const color = (uiConfig?.color || schema.color) as string | undefined;

  const compareUiConfig = compareWith?.ui_config as
    | Record<string, unknown>
    | undefined;
  const compareIcon = (compareUiConfig?.icon || compareWith?.icon) as
    | string
    | undefined;
  const compareColor = (compareUiConfig?.color || compareWith?.color) as
    | string
    | undefined;
  const compareDescription = compareWith?.description as string | undefined;

  // Check extraction prompt
  const extractionPrompt = schema.extraction_prompt as string | undefined;
  const compareExtractionPrompt = compareWith?.extraction_prompt as
    | string
    | undefined;

  // Check relationship types
  const sourceTypes = (schema.source_types ||
    schema.allowedSrcTypes ||
    schema.fromTypes) as string[] | undefined;
  const targetTypes = (schema.target_types ||
    schema.allowedDstTypes ||
    schema.toTypes) as string[] | undefined;
  const compareSourceTypes = (compareWith?.source_types ||
    compareWith?.allowedSrcTypes ||
    compareWith?.fromTypes) as string[] | undefined;
  const compareTargetTypes = (compareWith?.target_types ||
    compareWith?.allowedDstTypes ||
    compareWith?.toTypes) as string[] | undefined;

  // Check if any top-level fields changed
  if (icon !== undefined && icon !== compareIcon) return true;
  if (color !== undefined && color !== compareColor) return true;
  if (description && description !== compareDescription) return true;
  if (
    extractionPrompt !== undefined &&
    extractionPrompt !== compareExtractionPrompt
  )
    return true;
  if (
    sourceTypes &&
    sourceTypes.length > 0 &&
    !deepEqual(sourceTypes, compareSourceTypes)
  )
    return true;
  if (
    targetTypes &&
    targetTypes.length > 0 &&
    !deepEqual(targetTypes, compareTargetTypes)
  )
    return true;

  // Check if any properties differ
  if (properties) {
    const compareProperties = compareWith?.properties as
      | Record<string, unknown>
      | undefined;
    const propKeys = Object.keys(properties);
    const comparePropKeys = compareProperties
      ? Object.keys(compareProperties)
      : [];

    for (const key of propKeys) {
      // Property exists in schema but not in compareWith (removed in after)
      if (!comparePropKeys.includes(key)) return true;
      // Property values differ
      if (!deepEqual(properties[key], compareProperties?.[key])) return true;
    }
  }

  return false;
}

/**
 * Displays schema properties in a readable format
 * When showOnlyChanges is true, only shows fields that differ from compareWith
 */
function SchemaPropertiesDisplay({
  schema,
  variant,
  compareWith,
  showOnlyChanges = false,
}: SchemaPropertiesDisplayProps) {
  const properties = schema.properties as Record<string, unknown> | undefined;
  const required = (schema.required as string[]) || [];
  const description = schema.description as string | undefined;

  // For relationship types, show source/target types
  const sourceTypes = (schema.source_types ||
    schema.allowedSrcTypes ||
    schema.fromTypes) as string[] | undefined;
  const targetTypes = (schema.target_types ||
    schema.allowedDstTypes ||
    schema.toTypes) as string[] | undefined;

  // For UI config: check both top-level and nested ui_config
  const uiConfig = schema.ui_config as Record<string, unknown> | undefined;
  const icon = (uiConfig?.icon || schema.icon) as string | undefined;
  const color = (uiConfig?.color || schema.color) as string | undefined;

  // For extraction prompt
  const extractionPrompt = schema.extraction_prompt as string | undefined;

  // Compare values from the other schema
  const compareUiConfig = compareWith?.ui_config as
    | Record<string, unknown>
    | undefined;
  const compareIcon = (compareUiConfig?.icon || compareWith?.icon) as
    | string
    | undefined;
  const compareColor = (compareUiConfig?.color || compareWith?.color) as
    | string
    | undefined;
  const compareDescription = compareWith?.description as string | undefined;
  const compareExtractionPrompt = compareWith?.extraction_prompt as
    | string
    | undefined;
  const compareSourceTypes = (compareWith?.source_types ||
    compareWith?.allowedSrcTypes ||
    compareWith?.fromTypes) as string[] | undefined;
  const compareTargetTypes = (compareWith?.target_types ||
    compareWith?.allowedDstTypes ||
    compareWith?.toTypes) as string[] | undefined;

  const compareProperties = compareWith?.properties as
    | Record<string, unknown>
    | undefined;

  // Get list of property keys
  const propKeys = properties ? Object.keys(properties) : [];
  const comparePropKeys = compareProperties
    ? Object.keys(compareProperties)
    : [];

  // When showOnlyChanges is true, filter to only show different properties
  const filteredPropKeys =
    showOnlyChanges && compareWith
      ? propKeys.filter((key) => {
          const prop = properties?.[key];
          const compareProp = compareProperties?.[key];
          // Show if property doesn't exist in compare (added/removed)
          if (!comparePropKeys.includes(key)) return true;
          // Show if property values are different
          return !deepEqual(prop, compareProp);
        })
      : propKeys;

  // Determine which UI elements have changed
  const iconChanged = showOnlyChanges ? icon !== compareIcon : true;
  const colorChanged = showOnlyChanges ? color !== compareColor : true;
  const descriptionChanged = showOnlyChanges
    ? description !== compareDescription
    : true;
  const extractionPromptChanged = showOnlyChanges
    ? extractionPrompt !== compareExtractionPrompt
    : true;
  const sourceTypesChanged = showOnlyChanges
    ? !deepEqual(sourceTypes, compareSourceTypes)
    : true;
  const targetTypesChanged = showOnlyChanges
    ? !deepEqual(targetTypes, compareTargetTypes)
    : true;

  // Determine if this has any UI config to show
  const hasIconToShow = icon !== undefined && iconChanged;
  const hasColorToShow = color !== undefined && colorChanged;
  const isUiConfig = hasIconToShow || hasColorToShow;

  // Determine if this is an extraction prompt schema with changes
  const isExtractionPrompt =
    extractionPrompt !== undefined && extractionPromptChanged;

  // Check if there's anything to show
  const hasDescriptionToShow = description && descriptionChanged;
  const hasPropertiesToShow = filteredPropKeys.length > 0;
  const hasSourceTypesToShow =
    sourceTypes && sourceTypes.length > 0 && sourceTypesChanged;
  const hasTargetTypesToShow =
    targetTypes && targetTypes.length > 0 && targetTypesChanged;

  const hasAnythingToShow =
    hasDescriptionToShow ||
    isUiConfig ||
    isExtractionPrompt ||
    hasPropertiesToShow ||
    hasSourceTypesToShow ||
    hasTargetTypesToShow;

  if (showOnlyChanges && !hasAnythingToShow) {
    return (
      <span className="text-base-content/50 italic text-[11px]">
        No changes
      </span>
    );
  }

  return (
    <div className="space-y-1.5 text-xs">
      {/* Description if present and changed */}
      {hasDescriptionToShow && (
        <p className="text-base-content/70 italic text-[11px]">{description}</p>
      )}

      {/* UI Config: Icon and Color (only if changed) */}
      {isUiConfig && (
        <div className="space-y-1.5">
          {hasIconToShow && (
            <div className="flex items-center gap-2">
              <span className="text-base-content/60 text-[10px] w-10">
                Icon:
              </span>
              <div className="flex items-center gap-1.5">
                <Icon
                  icon={icon.includes('--') ? icon : `lucide--${icon}`}
                  className="size-4"
                />
                <span className="font-mono text-[11px]">{icon}</span>
              </div>
            </div>
          )}
          {hasColorToShow && (
            <div className="flex items-center gap-2">
              <span className="text-base-content/60 text-[10px] w-10">
                Color:
              </span>
              <div className="flex items-center gap-1.5">
                <span
                  className="size-4 rounded border border-base-300"
                  style={{ backgroundColor: color }}
                />
                <span className="font-mono text-[11px]">{color}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Extraction Prompt (only if changed) */}
      {isExtractionPrompt && (
        <div className="space-y-1">
          <span className="text-base-content/60 text-[10px]">Prompt:</span>
          <p className="text-[11px] bg-base-200/50 rounded p-2 whitespace-pre-wrap max-h-32 overflow-y-auto">
            {extractionPrompt}
          </p>
        </div>
      )}

      {/* Properties (only changed ones when showOnlyChanges is true) */}
      {properties && filteredPropKeys.length > 0 && (
        <div className="space-y-1">
          {filteredPropKeys.map((propKey) => {
            const prop = properties[propKey] as Record<string, unknown>;
            const isRequired = required.includes(propKey);
            const isNew =
              variant === 'add' &&
              compareWith &&
              !comparePropKeys.includes(propKey);
            const isRemoved =
              variant === 'remove' &&
              compareWith &&
              !comparePropKeys.includes(propKey);

            return (
              <PropertyItem
                key={propKey}
                name={propKey}
                prop={prop}
                isRequired={isRequired}
                isNew={isNew}
                isRemoved={isRemoved}
                variant={variant}
              />
            );
          })}
        </div>
      )}

      {/* Relationship source/target types (only if changed) */}
      {(hasSourceTypesToShow || hasTargetTypesToShow) && (
        <div className="pt-1 border-t border-base-300/50 space-y-1">
          {hasSourceTypesToShow && (
            <div className="flex items-center gap-1.5">
              <span className="text-base-content/60 text-[10px]">From:</span>
              <div className="flex flex-wrap gap-1">
                {sourceTypes.map((t) => (
                  <span key={t} className="badge badge-xs badge-ghost">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
          {hasTargetTypesToShow && (
            <div className="flex items-center gap-1.5">
              <span className="text-base-content/60 text-[10px]">To:</span>
              <div className="flex flex-wrap gap-1">
                {targetTypes.map((t) => (
                  <span key={t} className="badge badge-xs badge-ghost">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* If nothing to show, display a simple message */}
      {!isUiConfig &&
        !isExtractionPrompt &&
        filteredPropKeys.length === 0 &&
        !hasSourceTypesToShow &&
        !hasTargetTypesToShow && (
          <span className="text-base-content/50 italic">
            No properties defined
          </span>
        )}
    </div>
  );
}

// ============================================================================
// Property Item Display
// ============================================================================

interface PropertyItemProps {
  name: string;
  prop: Record<string, unknown>;
  isRequired: boolean;
  isNew?: boolean;
  isRemoved?: boolean;
  variant: 'add' | 'remove';
}

function PropertyItem({
  name,
  prop,
  isRequired,
  isNew,
  isRemoved,
  variant,
}: PropertyItemProps) {
  const propType = prop.type as string | undefined;
  const propFormat = prop.format as string | undefined;
  const propDescription = prop.description as string | undefined;
  const propEnum = prop.enum as unknown[] | undefined;
  const propExamples = prop.examples as unknown[] | undefined;

  // Determine text color based on context
  const textColorClass =
    isNew || isRemoved
      ? variant === 'add'
        ? 'text-success font-medium'
        : 'text-error font-medium'
      : 'text-base-content';

  // Build type label
  let typeLabel = propType || 'any';
  if (propFormat) {
    typeLabel = `${propType}(${propFormat})`;
  }
  if (propEnum) {
    typeLabel = `enum`;
  }

  return (
    <div
      className={`rounded px-2 py-1 ${
        variant === 'add' ? 'bg-success/5' : 'bg-error/5'
      }`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`font-mono font-medium ${textColorClass}`}>
          {name}
        </span>
        <span className="text-base-content/50 text-[10px]">{typeLabel}</span>
        {isRequired && (
          <span className="badge badge-xs badge-error">required</span>
        )}
        {isNew && <span className="badge badge-xs badge-success">new</span>}
        {isRemoved && (
          <span className="badge badge-xs badge-error">removed</span>
        )}
      </div>
      {propDescription && (
        <p className="text-base-content/60 text-[10px] mt-0.5">
          {propDescription}
        </p>
      )}
      {propEnum && propEnum.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {propEnum.slice(0, 5).map((val, idx) => (
            <span key={idx} className="badge badge-xs badge-outline">
              {String(val)}
            </span>
          ))}
          {propEnum.length > 5 && (
            <span className="text-[10px] text-base-content/40">
              +{propEnum.length - 5} more
            </span>
          )}
        </div>
      )}
      {propExamples && propExamples.length > 0 && (
        <div className="mt-1">
          <span className="text-[9px] text-base-content/40 uppercase">
            Examples:{' '}
          </span>
          <span className="text-[10px] text-base-content/60">
            {propExamples
              .slice(0, 3)
              .map((ex) => (typeof ex === 'string' ? ex : JSON.stringify(ex)))
              .join(', ')}
            {propExamples.length > 3 && ` +${propExamples.length - 3} more`}
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
