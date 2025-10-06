import { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/components/atoms/Icon';
import type { IntegrationsClient, ClickUpWorkspaceStructure, TriggerSyncResponse } from '@/api/integrations';
import { WorkspaceTree } from './WorkspaceTree';
import { ImportConfigForm, type ImportConfig } from './ImportConfigForm';
import { ImportProgress } from './ImportProgress';

export interface ClickUpSyncModalProps {
    client: IntegrationsClient;
    onClose: () => void;
    onSuccess?: (result: TriggerSyncResponse) => void;
}

type SyncStep = 'select' | 'configure' | 'progress' | 'complete';

export function ClickUpSyncModal({ client, onClose, onSuccess }: ClickUpSyncModalProps) {
    const [step, setStep] = useState<SyncStep>('select');
    const [structure, setStructure] = useState<ClickUpWorkspaceStructure | null>(null);
    const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
    const [config, setConfig] = useState<ImportConfig>({
        includeArchived: false,
        batchSize: 100,
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<TriggerSyncResponse | null>(null);

    const loadStructure = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await client.getClickUpWorkspaceStructure();
            setStructure(data);
        } catch (err) {
            const error = err as Error;
            setError(error.message || 'Failed to load workspace structure');
        } finally {
            setLoading(false);
        }
    }, [client]);

    // Load workspace structure on mount
    useEffect(() => {
        loadStructure();
    }, [loadStructure]);

    const handleNext = () => {
        if (step === 'select') {
            if (selectedListIds.length === 0) {
                setError('Please select at least one list to import');
                return;
            }
            setError(null);
            setStep('configure');
        } else if (step === 'configure') {
            handleStartSync();
        }
    };

    const handleBack = () => {
        if (step === 'configure') {
            setStep('select');
        }
    };

    const handleStartSync = async () => {
        setSyncing(true);
        setError(null);
        setStep('progress');

        try {
            const result = await client.triggerSync('clickup', {
                list_ids: selectedListIds,
                includeArchived: config.includeArchived,
                batchSize: config.batchSize,
            });

            setSyncResult(result);
            setStep('complete');

            if (onSuccess) {
                onSuccess(result);
            }
        } catch (err) {
            const error = err as Error;
            setError(error.message || 'Sync failed');
            setStep('configure');
        } finally {
            setSyncing(false);
        }
    };

    const getStepTitle = () => {
        switch (step) {
            case 'select':
                return 'Select Lists to Import';
            case 'configure':
                return 'Configure Import Options';
            case 'progress':
                return 'Importing...';
            case 'complete':
                return 'Import Complete';
        }
    };

    return (
        <dialog open className="modal modal-open">
            <div className="max-w-4xl modal-box">
                {/* Header */}
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg">{getStepTitle()}</h3>
                    <button
                        className="btn btn-sm btn-circle btn-ghost"
                        onClick={onClose}
                        disabled={syncing}
                    >
                        <Icon icon="lucide--x" className="w-4 h-4" />
                    </button>
                </div>

                {/* Steps Indicator */}
                <ul className="mb-6 w-full steps steps-horizontal">
                    <li className={`step ${step === 'select' || step === 'configure' || step === 'progress' || step === 'complete' ? 'step-primary' : ''}`}>
                        Select Lists
                    </li>
                    <li className={`step ${step === 'configure' || step === 'progress' || step === 'complete' ? 'step-primary' : ''}`}>
                        Configure
                    </li>
                    <li className={`step ${step === 'progress' || step === 'complete' ? 'step-primary' : ''}`}>
                        Import
                    </li>
                </ul>

                {/* Error Alert */}
                {error && (
                    <div className="mb-4 alert alert-error">
                        <Icon icon="lucide--alert-circle" className="w-5 h-5" />
                        <span>{error}</span>
                        <button
                            className="btn btn-sm btn-ghost"
                            onClick={() => setError(null)}
                        >
                            <Icon icon="lucide--x" className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {/* Content */}
                <div className="min-h-[400px]">
                    {step === 'select' && (
                        <div>
                            {loading ? (
                                <div className="flex justify-center items-center py-20">
                                    <span className="loading loading-spinner loading-lg"></span>
                                </div>
                            ) : structure ? (
                                <>
                                    <div className="flex justify-between items-center mb-4">
                                        <p className="text-sm text-base-content/70">
                                            Workspace: <span className="font-semibold">{structure.workspace.name}</span>
                                        </p>
                                        <div className="text-sm text-base-content/70">
                                            Selected: <span className="font-semibold text-primary">{selectedListIds.length}</span> lists
                                        </div>
                                    </div>
                                    <WorkspaceTree
                                        structure={structure}
                                        selectedListIds={selectedListIds}
                                        onSelectionChange={setSelectedListIds}
                                    />
                                </>
                            ) : (
                                <div className="py-20 text-center">
                                    <Icon icon="lucide--alert-circle" className="mx-auto mb-4 w-12 h-12 text-error" />
                                    <p className="mb-4 text-base-content/70">Failed to load workspace structure</p>
                                    <button className="btn btn-sm btn-primary" onClick={loadStructure}>
                                        Retry
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {step === 'configure' && (
                        <div>
                            <div className="mb-4 alert alert-info">
                                <Icon icon="lucide--info" className="w-5 h-5" />
                                <div>
                                    <div className="font-semibold">Selected {selectedListIds.length} lists</div>
                                    <div className="text-sm">Configure import options below</div>
                                </div>
                            </div>
                            <ImportConfigForm
                                config={config}
                                onChange={setConfig}
                            />
                        </div>
                    )}

                    {step === 'progress' && (
                        <ImportProgress syncing={syncing} />
                    )}

                    {step === 'complete' && syncResult && (
                        <div className="py-8 text-center">
                            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${syncResult.success ? 'bg-success/20' : 'bg-error/20'
                                }`}>
                                <Icon
                                    icon={syncResult.success ? 'lucide--check' : 'lucide--x'}
                                    className={`w-8 h-8 ${syncResult.success ? 'text-success' : 'text-error'}`}
                                />
                            </div>
                            <h4 className="mb-2 font-semibold text-xl">
                                {syncResult.success ? 'Import Successful!' : 'Import Failed'}
                            </h4>
                            <p className="mb-4 text-base-content/70">{syncResult.message}</p>
                            {syncResult.success && (
                                <div className="shadow stats stats-horizontal">
                                    <div className="stat">
                                        <div className="stat-title">Total Imported</div>
                                        <div className="text-primary stat-value">
                                            {(syncResult as any).totalImported || 0}
                                        </div>
                                    </div>
                                    {(syncResult as any).totalFailed > 0 && (
                                        <div className="stat">
                                            <div className="stat-title">Failed</div>
                                            <div className="text-error stat-value">
                                                {(syncResult as any).totalFailed}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="modal-action">
                    {step === 'select' && (
                        <>
                            <button
                                className="btn btn-ghost"
                                onClick={onClose}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleNext}
                                disabled={loading || selectedListIds.length === 0}
                            >
                                Next
                                <Icon icon="lucide--chevron-right" className="w-4 h-4" />
                            </button>
                        </>
                    )}

                    {step === 'configure' && (
                        <>
                            <button
                                className="btn btn-ghost"
                                onClick={handleBack}
                            >
                                <Icon icon="lucide--chevron-left" className="w-4 h-4" />
                                Back
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleNext}
                            >
                                Start Import
                                <Icon icon="lucide--play" className="w-4 h-4" />
                            </button>
                        </>
                    )}

                    {step === 'progress' && (
                        <button
                            className="btn btn-ghost"
                            disabled
                        >
                            Importing...
                        </button>
                    )}

                    {step === 'complete' && (
                        <button
                            className="btn btn-primary"
                            onClick={onClose}
                        >
                            Done
                        </button>
                    )}
                </div>
            </div>
            <div className="bg-base-300/50 modal-backdrop" onClick={onClose}></div>
        </dialog>
    );
}
