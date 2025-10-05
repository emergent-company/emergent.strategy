/**
 * Extraction Configuration Modal
 * 
 * Modal for configuring and triggering manual extraction from a document
 */

import { useState, useRef, useEffect } from 'react';
import { Icon } from '@/components/atoms/Icon';

export interface ExtractionConfig {
    entity_types: string[];
    confidence_threshold: number;
    entity_linking_strategy: 'strict' | 'fuzzy' | 'none';
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

// Available entity types for extraction
const ENTITY_TYPES = [
    { value: 'Requirement', label: 'Requirements', description: 'Functional and non-functional requirements' },
    { value: 'Decision', label: 'Decisions', description: 'Architecture and design decisions' },
    { value: 'Feature', label: 'Features', description: 'Product features and capabilities' },
    { value: 'Task', label: 'Tasks', description: 'Action items and todos' },
    { value: 'Bug', label: 'Bugs', description: 'Defects and issues' },
    { value: 'Risk', label: 'Risks', description: 'Project risks and concerns' },
    { value: 'Actor', label: 'Actors', description: 'Users, roles, and stakeholders' },
    { value: 'UseCase', label: 'Use Cases', description: 'System use cases' },
];

export function ExtractionConfigModal({
    isOpen,
    onClose,
    onConfirm,
    isLoading = false,
    documentName,
}: ExtractionConfigModalProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);

    // Default configuration
    const [config, setConfig] = useState<ExtractionConfig>({
        entity_types: ['Requirement', 'Decision', 'Feature', 'Task'],
        confidence_threshold: 0.7,
        entity_linking_strategy: 'fuzzy',
        require_review: false,
        send_notification: true,
    });

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

    console.log('ExtractionConfigModal rendering - isOpen:', isOpen, 'documentName:', documentName);

    return (
        <dialog
            ref={dialogRef}
            className="modal"
            onClose={handleClose}
        >
            <div className="max-w-2xl modal-box">
                {/* Header */}
                <div className="flex justify-between items-start mb-4">
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

                {/* Entity Types Selection */}
                <div className="mb-6">
                    <label className="label">
                        <span className="font-semibold label-text">Entity Types to Extract</span>
                    </label>
                    <div className="gap-2 grid grid-cols-1 sm:grid-cols-2">
                        {ENTITY_TYPES.map((entityType) => (
                            <label
                                key={entityType.value}
                                className="flex items-start gap-3 p-3 border hover:border-primary border-base-300 rounded-box transition-colors cursor-pointer"
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
                    {config.entity_types.length === 0 && (
                        <div className="label">
                            <span className="label-text-alt text-warning">
                                Select at least one entity type
                            </span>
                        </div>
                    )}
                </div>

                {/* Confidence Threshold */}
                <div className="mb-6">
                    <label className="label">
                        <span className="font-semibold label-text">Confidence Threshold</span>
                        <span className="label-text-alt">{(config.confidence_threshold * 100).toFixed(0)}%</span>
                    </label>
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
                        className="range range-primary"
                        step="5"
                        disabled={isLoading}
                    />
                    <div className="flex justify-between mt-1 text-xs text-base-content/60">
                        <span>More results (lower confidence)</span>
                        <span>Fewer results (higher confidence)</span>
                    </div>
                </div>

                {/* Entity Linking Strategy */}
                <div className="mb-6">
                    <label className="label">
                        <span className="font-semibold label-text">Entity Linking Strategy</span>
                    </label>
                    <div className="w-full join join-vertical">
                        <label className="flex items-start gap-3 hover:bg-base-200 p-3 border border-base-300 cursor-pointer join-item">
                            <input
                                type="radio"
                                name="linking-strategy"
                                className="mt-0.5 radio radio-primary"
                                checked={config.entity_linking_strategy === 'strict'}
                                onChange={() =>
                                    setConfig((prev) => ({ ...prev, entity_linking_strategy: 'strict' }))
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
                                    setConfig((prev) => ({ ...prev, entity_linking_strategy: 'fuzzy' }))
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
                                    setConfig((prev) => ({ ...prev, entity_linking_strategy: 'none' }))
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

                {/* Options */}
                <div className="space-y-3 mb-6">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            className="toggle toggle-primary"
                            checked={config.require_review}
                            onChange={(e) =>
                                setConfig((prev) => ({ ...prev, require_review: e.target.checked }))
                            }
                            disabled={isLoading}
                        />
                        <div className="flex-1">
                            <div className="font-medium">Require Review</div>
                            <div className="text-xs text-base-content/60">
                                Extracted entities will need manual review before being added
                            </div>
                        </div>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            className="toggle toggle-primary"
                            checked={config.send_notification}
                            onChange={(e) =>
                                setConfig((prev) => ({ ...prev, send_notification: e.target.checked }))
                            }
                            disabled={isLoading}
                        />
                        <div className="flex-1">
                            <div className="font-medium">Send Notification</div>
                            <div className="text-xs text-base-content/60">
                                Notify when extraction is complete
                            </div>
                        </div>
                    </label>
                </div>

                {/* Actions */}
                <div className="modal-action">
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
                        disabled={isLoading || config.entity_types.length === 0}
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

            {/* Backdrop - click outside to close */}
            <form method="dialog" className="modal-backdrop">
                <button>close</button>
            </form>
        </dialog>
    );
}
