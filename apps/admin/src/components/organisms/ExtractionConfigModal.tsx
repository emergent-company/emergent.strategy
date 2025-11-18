/**
 * Extraction Configuration Modal
 *
 * Modal for configuring and triggering manual extraction from a document
 */

import { useState, useRef, useEffect } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { useConfig } from '@/contexts/config';
import { useApi } from '@/hooks/use-api';

export interface ExtractionConfig {
  entity_types: string[];
  confidence_threshold: number;
  entity_linking_strategy: 'strict' | 'fuzzy' | 'none';
  duplicate_strategy?: 'skip' | 'merge';
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

export function ExtractionConfigModal({
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
    entity_linking_strategy: 'fuzzy',
    duplicate_strategy: 'skip',
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

  console.log(
    'ExtractionConfigModal rendering - isOpen:',
    isOpen,
    'documentName:',
    documentName
  );

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
        <div className="flex-1 overflow-y-auto px-6">
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

          {/* Confidence Threshold */}
          <div className="mb-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="flex items-center">
                <span className="font-semibold label-text">
                  Confidence Threshold
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={config.confidence_threshold * 100}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      confidence_threshold: parseInt(e.target.value) / 100,
                    }))
                  }
                  className="range range-primary flex-1"
                  step="5"
                  disabled={isLoading}
                />
                <span className="text-lg font-bold text-primary min-w-[4rem] text-right">
                  {(config.confidence_threshold * 100).toFixed(0)}%
                </span>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2">
              <div></div>
              <div className="flex justify-between text-xs text-base-content/60">
                <span>Lower confidence</span>
                <span>Higher confidence</span>
              </div>
            </div>
          </div>

          {/* Entity Linking and Duplicate Handling - Side by Side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {/* Entity Linking Strategy */}
            <div>
              <label className="mb-3 label">
                <span className="font-semibold label-text">
                  Entity Linking Strategy
                </span>
              </label>
              <div className="w-full join join-vertical">
                <label className="flex items-start gap-3 hover:bg-base-200 p-3 border border-base-300 cursor-pointer join-item">
                  <input
                    type="radio"
                    name="linking-strategy"
                    className="mt-0.5 radio radio-primary"
                    checked={config.entity_linking_strategy === 'strict'}
                    onChange={() =>
                      setConfig((prev) => ({
                        ...prev,
                        entity_linking_strategy: 'strict',
                      }))
                    }
                    disabled={isLoading}
                  />
                  <div className="flex-1">
                    <div className="font-medium">Strict</div>
                    <div className="text-xs text-base-content/60">
                      Only link entities with exact matches
                    </div>
                  </div>
                </label>
                <label className="flex items-start gap-3 hover:bg-base-200 p-3 border border-base-300 cursor-pointer join-item">
                  <input
                    type="radio"
                    name="linking-strategy"
                    className="mt-0.5 radio radio-primary"
                    checked={config.entity_linking_strategy === 'fuzzy'}
                    onChange={() =>
                      setConfig((prev) => ({
                        ...prev,
                        entity_linking_strategy: 'fuzzy',
                      }))
                    }
                    disabled={isLoading}
                  />
                  <div className="flex-1">
                    <div className="font-medium">Fuzzy (Recommended)</div>
                    <div className="text-xs text-base-content/60">
                      Link entities with similar names and context
                    </div>
                  </div>
                </label>
                <label className="flex items-start gap-3 hover:bg-base-200 p-3 border border-base-300 cursor-pointer join-item">
                  <input
                    type="radio"
                    name="linking-strategy"
                    className="mt-0.5 radio radio-primary"
                    checked={config.entity_linking_strategy === 'none'}
                    onChange={() =>
                      setConfig((prev) => ({
                        ...prev,
                        entity_linking_strategy: 'none',
                      }))
                    }
                    disabled={isLoading}
                  />
                  <div className="flex-1">
                    <div className="font-medium">None</div>
                    <div className="text-xs text-base-content/60">
                      Create all entities as new (no linking)
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {/* Duplicate Handling Strategy */}
            <div>
              <label className="mb-3 label">
                <span className="font-semibold label-text">
                  Duplicate Handling Strategy
                </span>
              </label>
              <div className="w-full join join-vertical">
                <label className="flex items-start gap-3 hover:bg-base-200 p-3 border border-base-300 cursor-pointer join-item">
                  <input
                    type="radio"
                    name="duplicate-strategy"
                    className="mt-0.5 radio radio-primary"
                    checked={config.duplicate_strategy === 'skip'}
                    onChange={() =>
                      setConfig((prev) => ({
                        ...prev,
                        duplicate_strategy: 'skip',
                      }))
                    }
                    disabled={isLoading}
                  />
                  <div className="flex-1">
                    <div className="font-medium">Skip (Default)</div>
                    <div className="text-xs text-base-content/60">
                      Skip duplicate entities - faster, prevents duplicates
                    </div>
                  </div>
                </label>
                <label className="flex items-start gap-3 hover:bg-base-200 p-3 border border-base-300 cursor-pointer join-item">
                  <input
                    type="radio"
                    name="duplicate-strategy"
                    className="mt-0.5 radio radio-primary"
                    checked={config.duplicate_strategy === 'merge'}
                    onChange={() =>
                      setConfig((prev) => ({
                        ...prev,
                        duplicate_strategy: 'merge',
                      }))
                    }
                    disabled={isLoading}
                  />
                  <div className="flex-1">
                    <div className="font-medium">Merge (Recommended)</div>
                    <div className="text-xs text-base-content/60">
                      Merge new data into existing entities - enriches over time
                    </div>
                  </div>
                </label>
              </div>
              <div className="mt-2 text-xs text-base-content/60">
                <Icon
                  icon="lucide--info"
                  className="inline-block mr-1 size-3"
                />
                {config.duplicate_strategy === 'merge' ? (
                  <>
                    Updates existing entities with new properties and increases
                    confidence scores
                  </>
                ) : (
                  <>
                    Prevents duplicate entities by skipping ones that already
                    exist
                  </>
                )}
              </div>
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
