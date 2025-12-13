/**
 * Extraction Configuration Modal
 *
 * Modal for configuring and triggering manual extraction from a document
 */

import { useState, useRef, useEffect, memo } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { useConfig } from '@/contexts/config';
import { useApi } from '@/hooks/use-api';

export interface ExtractionConfig {
  entity_types: string[];
  /** Draft threshold - entities below this get extra review marking (default: 70%) */
  confidence_threshold: number;
  /** Auto-accept threshold - entities at or above this are marked 'accepted', below are 'draft' (default: 90%) */
  auto_accept_threshold: number;
  /** LLM extraction method - json_freeform for best property extraction, responseSchema/function_calling for speed */
  extraction_method?: 'json_freeform' | 'responseSchema' | 'function_calling';
  require_review: boolean;
  send_notification: boolean;
}

export interface ExtractionConfigModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal is closed */
  onClose: () => void;
  /** Callback when extraction is confirmed with config */
  onConfirm: (config: ExtractionConfig) => void;
  /** Whether extraction is currently being started */
  isLoading?: boolean;
  /** Document filename for display */
  documentName?: string;
}

interface EntityType {
  value: string;
  label: string;
  description: string;
}

function ExtractionConfigModalComponent({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
  documentName,
}: ExtractionConfigModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const config_context = useConfig();
  const { apiBase, fetchJson } = useApi();

  // Available entity types from type registry
  const [availableTypes, setAvailableTypes] = useState<EntityType[]>([]);
  const [isLoadingTypes, setIsLoadingTypes] = useState(true);

  // Default configuration
  const [config, setConfig] = useState<ExtractionConfig>({
    entity_types: [],
    confidence_threshold: 0.7,
    auto_accept_threshold: 0.9,
    extraction_method: 'json_freeform',
    require_review: false,
    send_notification: true,
  });

  // Fetch available object types from template packs
  useEffect(() => {
    const projectId = config_context.config.activeProjectId;
    if (!projectId) return;

    const fetchTypes = async () => {
      try {
        setIsLoadingTypes(true);

        // Fetch compiled object types from active template packs
        const compiledTypes = await fetchJson<Record<string, any>>(
          `${apiBase}/api/template-packs/projects/${projectId}/compiled-types`
        );

        // Transform compiled types into EntityType format
        const types: EntityType[] = Object.entries(compiledTypes).map(
          ([typeName, schema]) => ({
            value: typeName,
            label: typeName + 's', // Pluralize for display
            description:
              schema.description ||
              `Extract ${typeName} entities from documents`,
          })
        );

        // Sort alphabetically by label
        types.sort((a, b) => a.label.localeCompare(b.label));

        setAvailableTypes(types);

        // Set default selected types (all types checked by default)
        if (types.length > 0) {
          const defaultTypes = types.map((t) => t.value);
          setConfig((prev) => ({ ...prev, entity_types: defaultTypes }));
        }
      } catch (error) {
        console.error(
          'Failed to fetch object types from template packs:',
          error
        );
        // Fallback to empty array - user can't extract if no types available
        setAvailableTypes([]);
      } finally {
        setIsLoadingTypes(false);
      }
    };

    fetchTypes();
  }, [config_context.config.activeProjectId, apiBase, fetchJson]);

  // Control dialog visibility using showModal/close methods
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  const handleEntityTypeToggle = (entityType: string) => {
    setConfig((prev) => ({
      ...prev,
      entity_types: prev.entity_types.includes(entityType)
        ? prev.entity_types.filter((t) => t !== entityType)
        : [...prev.entity_types, entityType],
    }));
  };

  const handleSubmit = () => {
    onConfirm(config);
  };

  const handleClose = () => {
    if (!isLoading) {
      onClose();
    }
  };

  return (
    <dialog ref={dialogRef} className="modal" onClose={handleClose}>
      <div className="flex flex-col max-w-4xl max-h-[90vh] modal-box p-0">
        {/* Fixed Header */}
        <div className="flex justify-between items-start p-6 pb-4 shrink-0">
          <div>
            <h3 className="font-bold text-lg">Extract Objects</h3>
            {documentName && (
              <p className="mt-1 text-sm text-base-content/60">
                From: <span className="font-medium">{documentName}</span>
              </p>
            )}
          </div>
          <button
            className="btn btn-sm btn-circle btn-ghost"
            onClick={handleClose}
            disabled={isLoading}
            aria-label="Close modal"
          >
            <Icon icon="lucide--x" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {/* Entity Types Selection */}
          <div className="mb-6">
            <label className="mb-3 label">
              <span className="font-semibold label-text">
                Entity Types to Extract
              </span>
            </label>
            {isLoadingTypes ? (
              <div className="flex justify-center items-center py-8">
                <span className="loading loading-spinner loading-md" />
              </div>
            ) : availableTypes.length === 0 ? (
              <div className="alert alert-warning">
                <Icon icon="lucide--triangle-alert" />
                <div>
                  <div className="font-semibold">No Object Types Available</div>
                  <div className="text-sm">
                    Install a template pack from Settings → Templates to enable
                    extraction
                  </div>
                </div>
              </div>
            ) : (
              <div className="gap-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {availableTypes.map((entityType) => (
                  <label
                    key={entityType.value}
                    className="flex items-start gap-3 p-3 border border-base-300 hover:border-primary rounded-box transition-colors cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 checkbox checkbox-primary"
                      checked={config.entity_types.includes(entityType.value)}
                      onChange={() => handleEntityTypeToggle(entityType.value)}
                      disabled={isLoading}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{entityType.label}</div>
                      <div className="text-xs text-base-content/60">
                        {entityType.description}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
            {!isLoadingTypes &&
              availableTypes.length > 0 &&
              config.entity_types.length === 0 && (
                <div className="label">
                  <span className="label-text-alt text-warning">
                    Select at least one entity type
                  </span>
                </div>
              )}
          </div>

          {/* Confidence Thresholds */}
          <div className="mb-6">
            <label className="mb-3 label">
              <span className="font-semibold label-text">
                Confidence Thresholds
              </span>
            </label>

            {/* Visual Zone Indicator */}
            <div className="mb-4">
              <div className="flex h-8 rounded-lg overflow-hidden border border-base-300">
                {/* Rejected Zone (0 to minimum threshold) */}
                <div
                  className="bg-error/30 flex items-center justify-center text-xs font-medium text-error-content/70 border-r border-base-300"
                  style={{ width: `${config.confidence_threshold * 100}%` }}
                >
                  {config.confidence_threshold >= 0.15 && (
                    <span className="truncate px-1">Rejected</span>
                  )}
                </div>
                {/* Draft Zone (minimum threshold to auto-accept) */}
                <div
                  className="bg-info/30 flex items-center justify-center text-xs font-medium text-info-content/70 border-r border-base-300"
                  style={{
                    width: `${
                      (config.auto_accept_threshold -
                        config.confidence_threshold) *
                      100
                    }%`,
                  }}
                >
                  {config.auto_accept_threshold - config.confidence_threshold >=
                    0.1 && <span className="truncate px-1">Draft</span>}
                </div>
                {/* Accepted Zone (auto-accept to 100%) */}
                <div
                  className="bg-success/30 flex items-center justify-center text-xs font-medium text-success-content/70"
                  style={{
                    width: `${(1 - config.auto_accept_threshold) * 100}%`,
                  }}
                >
                  {1 - config.auto_accept_threshold >= 0.08 && (
                    <span className="truncate px-1">Accepted</span>
                  )}
                </div>
              </div>
              <div className="flex justify-between text-xs text-base-content/50 mt-1">
                <span>0%</span>
                <span>100%</span>
              </div>
            </div>

            {/* Minimum Confidence Threshold Slider */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm bg-error/50" />
                <span className="label-text">Minimum Confidence</span>
                <div
                  className="tooltip tooltip-right"
                  data-tip="Entities below this confidence will be rejected and not created"
                >
                  <Icon
                    icon="lucide--info"
                    className="size-3.5 text-base-content/60 cursor-help"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max={config.auto_accept_threshold * 100 - 5}
                  value={config.confidence_threshold * 100}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      confidence_threshold: parseInt(e.target.value) / 100,
                    }))
                  }
                  className="range range-error range-sm flex-1"
                  step="5"
                  disabled={isLoading}
                />
                <span className="text-sm font-bold text-error min-w-[3.5rem] text-right">
                  {(config.confidence_threshold * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            {/* Auto-Accept Threshold Slider */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm bg-success/50" />
                <span className="label-text">Auto-Accept Threshold</span>
                <div
                  className="tooltip tooltip-right"
                  data-tip="Entities at or above this confidence will be marked as 'accepted', below will be 'draft'"
                >
                  <Icon
                    icon="lucide--info"
                    className="size-3.5 text-base-content/60 cursor-help"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={config.confidence_threshold * 100 + 5}
                  max="100"
                  value={config.auto_accept_threshold * 100}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      auto_accept_threshold: parseInt(e.target.value) / 100,
                    }))
                  }
                  className="range range-success range-sm flex-1"
                  step="5"
                  disabled={isLoading}
                />
                <span className="text-sm font-bold text-success min-w-[3.5rem] text-right">
                  {(config.auto_accept_threshold * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            {/* Legend */}
            <div className="mt-4 p-3 bg-base-200 rounded-lg text-xs text-base-content/70">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm bg-error/30 border border-error/50" />
                  <span>
                    &lt;{(config.confidence_threshold * 100).toFixed(0)}%:
                    Rejected
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm bg-info/30 border border-info/50" />
                  <span>
                    {(config.confidence_threshold * 100).toFixed(0)}%-
                    {(config.auto_accept_threshold * 100).toFixed(0)}%: Draft
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm bg-success/30 border border-success/50" />
                  <span>
                    ≥{(config.auto_accept_threshold * 100).toFixed(0)}%:
                    Accepted
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Extraction Method (Advanced) */}
          <div className="mb-6">
            <label className="mb-3 label">
              <span className="font-semibold label-text">
                LLM Extraction Method
              </span>
              <span className="badge badge-ghost badge-sm ml-2">Advanced</span>
            </label>
            <div className="w-full join join-vertical">
              <label className="flex items-start gap-3 hover:bg-base-200 p-3 border border-base-300 cursor-pointer join-item">
                <input
                  type="radio"
                  name="extraction-method"
                  className="mt-0.5 radio radio-primary"
                  checked={config.extraction_method === 'json_freeform'}
                  onChange={() =>
                    setConfig((prev) => ({
                      ...prev,
                      extraction_method: 'json_freeform',
                    }))
                  }
                  disabled={isLoading}
                />
                <div className="flex-1">
                  <div className="font-medium">
                    JSON Freeform (Recommended)
                    <span className="badge badge-success badge-sm ml-2">
                      Best Quality
                    </span>
                  </div>
                  <div className="text-xs text-base-content/60">
                    Uses JSON mode without schema enforcement - extracts all
                    properties including optional ones
                  </div>
                </div>
              </label>
              <label className="flex items-start gap-3 hover:bg-base-200 p-3 border border-base-300 cursor-pointer join-item">
                <input
                  type="radio"
                  name="extraction-method"
                  className="mt-0.5 radio radio-primary"
                  checked={config.extraction_method === 'responseSchema'}
                  onChange={() =>
                    setConfig((prev) => ({
                      ...prev,
                      extraction_method: 'responseSchema',
                    }))
                  }
                  disabled={isLoading}
                />
                <div className="flex-1">
                  <div className="font-medium">Response Schema</div>
                  <div className="text-xs text-base-content/60">
                    Uses Gemini's structured output with schema validation -
                    faster but may skip optional properties
                  </div>
                </div>
              </label>
              <label className="flex items-start gap-3 hover:bg-base-200 p-3 border border-base-300 cursor-pointer join-item">
                <input
                  type="radio"
                  name="extraction-method"
                  className="mt-0.5 radio radio-primary"
                  checked={config.extraction_method === 'function_calling'}
                  onChange={() =>
                    setConfig((prev) => ({
                      ...prev,
                      extraction_method: 'json_freeform',
                    }))
                  }
                  disabled={isLoading}
                />
                <div className="flex-1">
                  <div className="font-medium">Function Calling</div>
                  <div className="text-xs text-base-content/60">
                    Uses Gemini's function/tool calling API - faster but may
                    skip optional properties
                  </div>
                </div>
              </label>
            </div>
            <div className="mt-2 text-xs text-base-content/60">
              <Icon icon="lucide--info" className="inline-block mr-1 size-3" />
              {config.extraction_method === 'json_freeform' ? (
                <>
                  JSON Freeform produces the most complete extractions with all
                  properties populated
                </>
              ) : config.extraction_method === 'function_calling' ? (
                <>
                  Function calling uses tool declarations - faster but schema
                  enforcement may skip optional properties
                </>
              ) : (
                <>
                  Response schema enforces strict JSON output - fastest but may
                  skip optional properties
                </>
              )}
            </div>
          </div>

          {/* Options */}
          <div className="space-y-4 mb-6">
            <div className="grid lg:grid-cols-2 gap-4 items-center">
              <div className="flex items-center gap-2">
                <div className="font-medium">Require Review</div>
                <div
                  className="tooltip tooltip-right"
                  data-tip="Extracted entities will need manual review before being added to the knowledge base"
                >
                  <Icon
                    icon="lucide--info"
                    className="size-4 text-base-content/60 cursor-help"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <input
                  type="checkbox"
                  className="toggle toggle-primary"
                  checked={config.require_review}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      require_review: e.target.checked,
                    }))
                  }
                  disabled={isLoading}
                />
              </div>
            </div>
            <div className="grid lg:grid-cols-2 gap-4 items-center">
              <div className="flex items-center gap-2">
                <div className="font-medium">Send Notification</div>
                <div
                  className="tooltip tooltip-right"
                  data-tip="You will receive a notification when the extraction process is complete"
                >
                  <Icon
                    icon="lucide--info"
                    className="size-4 text-base-content/60 cursor-help"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <input
                  type="checkbox"
                  className="toggle toggle-primary"
                  checked={config.send_notification}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      send_notification: e.target.checked,
                    }))
                  }
                  disabled={isLoading}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Fixed Footer with Actions */}
        <div className="border-t border-base-300 p-6 pt-4 shrink-0">
          <div className="modal-action mt-0">
            <button
              className="btn btn-ghost"
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={
                isLoading ||
                isLoadingTypes ||
                config.entity_types.length === 0 ||
                availableTypes.length === 0
              }
            >
              {isLoading ? (
                <>
                  <span className="loading loading-spinner loading-sm" />
                  Starting Extraction...
                </>
              ) : (
                <>
                  <Icon icon="lucide--sparkles" />
                  Start Extraction
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Backdrop - click outside to close */}
      <form method="dialog" className="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>
  );
}

// Memoize to prevent unnecessary re-renders when parent updates
export const ExtractionConfigModal = memo(ExtractionConfigModalComponent);
