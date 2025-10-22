/**
 * Discovery Wizard Modal
 * 
 * Multi-step wizard for running auto-discovery:
 * 1. Configure - Select documents and parameters
 * 2. Analyzing - Show progress and poll job status
 * 3. Review Types - Edit discovered object types
 * 4. Review Relationships - Edit discovered relationships
 * 4.5. Configure Pack - Name pack and choose create/extend mode
 * 5. Complete - Show success and install template pack
 */

import { useState, useEffect, useRef } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { useApi } from '@/hooks/use-api';
import { Step1_Configure } from './Step1_Configure';
import { Step2_Analyzing } from './Step2_Analyzing';
import { Step3_ReviewTypes } from './Step3_ReviewTypes';
import { Step4_ReviewRelationships } from './Step4_ReviewRelationships';
import { Step4_5_ConfigurePack, type PackConfig } from './Step4_5_ConfigurePack';
import { Step5_Complete } from './Step5_Complete';

export interface DiscoveryWizardProps {
    projectId: string;
    isOpen: boolean;
    onClose: () => void;
}

export interface DiscoveryConfig {
    document_ids: string[];
    batch_size: number;
    min_confidence: number;
    include_relationships: boolean;
    max_iterations: number;
}

export interface DiscoveryJob {
    id: string;
    status: 'pending' | 'analyzing_documents' | 'extracting_types' | 'refining_types' | 'creating_pack' | 'completed' | 'failed';
    progress: {
        current_step: number;
        total_steps: number;
        message: string;
    };
    discovered_types: TypeCandidate[];
    discovered_relationships: Relationship[];
    template_pack_id?: string;
    error?: string;
}

export interface TypeCandidate {
    id: string;
    type_name: string;
    description: string;
    confidence: number;
    frequency: number;
    example_instances: string[];
    schema?: Record<string, unknown>;
}

export interface Relationship {
    id?: string;
    source_type: string;  // Maps to from_type in UI
    target_type: string;  // Maps to to_type in UI
    relation_type: string;  // Maps to relationship_name in UI
    description?: string;
    confidence: number;
    cardinality: '1:1' | '1:N' | 'N:1' | 'N:M' | 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';
}

const DEFAULT_CONFIG: DiscoveryConfig = {
    document_ids: [],
    batch_size: 50,
    min_confidence: 0.5,
    include_relationships: true,
    max_iterations: 3,
};

export function DiscoveryWizard({ projectId, isOpen, onClose }: DiscoveryWizardProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const { apiBase, fetchJson } = useApi();

    // Wizard state
    const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 4.5 | 5>(1);
    const [jobId, setJobId] = useState<string | null>(null);
    const [config, setConfig] = useState<DiscoveryConfig>(DEFAULT_CONFIG);
    const [jobData, setJobData] = useState<DiscoveryJob | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoadingPreviousJob, setIsLoadingPreviousJob] = useState(false);
    const [hasRestoredJob, setHasRestoredJob] = useState(false);
    const [userStartedFresh, setUserStartedFresh] = useState(false);

    // Edited data from review steps
    const [editedTypes, setEditedTypes] = useState<TypeCandidate[]>([]);
    const [editedRelationships, setEditedRelationships] = useState<Relationship[]>([]);

    // Template pack configuration
    const [packConfig, setPackConfig] = useState<PackConfig | null>(null);

    // Load any in-progress discovery jobs when wizard opens
    useEffect(() => {
        // Don't load jobs if wizard isn't open or user explicitly started fresh
        if (!isOpen || userStartedFresh) return;

        const loadInProgressJob = async () => {
            try {
                setIsLoadingPreviousJob(true);

                // Fetch all jobs for this project
                const jobs = await fetchJson<DiscoveryJob[]>(
                    `${apiBase}/api/discovery-jobs/projects/${projectId}`
                );

                console.log('[DISCOVERY WIZARD] Fetched jobs:', jobs);
                console.log('[DISCOVERY WIZARD] Jobs count:', jobs.length);

                // Strategy: Prefer jobs with data over in-progress jobs
                // 1. First, try to find a completed job with types
                let activeJob = jobs.find(
                    job => job.status === 'completed' &&
                        job.discovered_types &&
                        job.discovered_types.length > 0
                );

                if (activeJob) {
                    console.log('[DISCOVERY WIZARD] Found completed job with types:', activeJob.id);
                } else {
                    // 2. If no completed job with types, find most recent in-progress job
                    activeJob = jobs.find(
                        job => job.status !== 'completed' && job.status !== 'failed'
                    );
                    if (activeJob) {
                        console.log('[DISCOVERY WIZARD] Found in-progress job:', activeJob.id);
                    }
                }

                if (activeJob) {
                    console.log('[DISCOVERY WIZARD] Active job:', activeJob.id, 'status:', activeJob.status);
                    console.log('[DISCOVERY WIZARD] discovered_types:', activeJob.discovered_types);
                    console.log('[DISCOVERY WIZARD] discovered_types length:', activeJob.discovered_types?.length);

                    setJobId(activeJob.id);
                    setJobData(activeJob);

                    // Determine which step to show based on job status AND data availability
                    // If we have discovered types, user was already reviewing them
                    if (activeJob.discovered_types && activeJob.discovered_types.length > 0) {
                        console.log('[DISCOVERY WIZARD] Has types, going to step 3');
                        // Analysis complete, show review steps
                        setEditedTypes(activeJob.discovered_types);
                        setEditedRelationships(activeJob.discovered_relationships || []);
                        setCurrentStep(3);
                    } else if (activeJob.status === 'pending' ||
                        activeJob.status === 'analyzing_documents' ||
                        activeJob.status === 'extracting_types' ||
                        activeJob.status === 'refining_types') {
                        console.log('[DISCOVERY WIZARD] Job still running, going to step 2');
                        // Job still running and no types yet, show analyzing step
                        setCurrentStep(2);
                    } else {
                        console.log('[DISCOVERY WIZARD] Fallback: going to step 2');
                        // Fallback: show analyzing step if unclear
                        setCurrentStep(2);
                    }

                    setHasRestoredJob(true);
                } else {
                    console.log('[DISCOVERY WIZARD] No jobs found to restore');
                }
            } catch (err) {
                console.error('Failed to load in-progress job:', err);
                // Don't show error - just start fresh
            } finally {
                setIsLoadingPreviousJob(false);
            }
        };

        loadInProgressJob();
    }, [isOpen, projectId, apiBase, fetchJson, userStartedFresh]);

    // Handle modal open/close
    useEffect(() => {
        if (isOpen && dialogRef.current && !dialogRef.current.open) {
            dialogRef.current.showModal();
            // Reset userStartedFresh flag when wizard opens to allow job loading
            setUserStartedFresh(false);
        } else if (!isOpen && dialogRef.current?.open) {
            dialogRef.current.close();
        }
    }, [isOpen]);

    // Start discovery job
    const handleStartDiscovery = async () => {
        try {
            setError(null);
            const response = await fetchJson<{ job_id: string }>(
                `${apiBase}/api/discovery-jobs/projects/${projectId}/start`,
                {
                    method: 'POST',
                    body: config,
                }
            );

            setJobId(response.job_id);
            setCurrentStep(2); // Move to analyzing step
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to start discovery');
        }
    };

    // Cancel job
    const handleCancelJob = async () => {
        if (!jobId) return;

        try {
            await fetchJson(`${apiBase}/api/discovery-jobs/${jobId}`, {
                method: 'DELETE',
            });
            handleClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to cancel job');
        }
    };

    // Move to type review step
    const handleTypesExtracted = (job: DiscoveryJob) => {
        setJobData(job);
        setEditedTypes(job.discovered_types);
        setEditedRelationships(job.discovered_relationships);
        setCurrentStep(3);
    };

    // Move to relationship review step
    const handleTypesReviewed = () => {
        // Filter relationships to only include those where both source and target types still exist
        const remainingTypeNames = new Set(editedTypes.map(t => t.type_name));

        const filteredRelationships = editedRelationships.filter(rel => {
            const sourceExists = remainingTypeNames.has(rel.source_type);
            const targetExists = remainingTypeNames.has(rel.target_type);
            return sourceExists && targetExists;
        });

        console.log('[DiscoveryWizard] Filtering relationships:');
        console.log(`  - Remaining types: ${Array.from(remainingTypeNames).join(', ')}`);
        console.log(`  - Original relationships: ${editedRelationships.length}`);
        console.log(`  - Filtered relationships: ${filteredRelationships.length}`);

        // Update relationships to only include valid ones
        setEditedRelationships(filteredRelationships);
        setCurrentStep(4);
    };

    // Move to pack configuration step
    const handleReviewRelationshipsComplete = () => {
        setCurrentStep(4.5);
    };

    // Handle pack configuration and generate template pack
    const handlePackConfigured = async (config: PackConfig) => {
        try {
            setError(null);
            setPackConfig(config);

            // TODO: Send pack config to backend to generate the pack
            // For now, just move to complete step
            console.log('[DiscoveryWizard] Pack config:', config);

            setCurrentStep(5);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to generate template pack');
        }
    };

    // Close and reset wizard
    const handleClose = () => {
        setCurrentStep(1);
        setJobId(null);
        setConfig(DEFAULT_CONFIG);
        setJobData(null);
        setError(null);
        setEditedTypes([]);
        setEditedRelationships([]);
        setHasRestoredJob(false);

        onClose();
    };

    // Start fresh (cancel current job and reset)
    const handleStartFresh = async () => {
        try {
            if (jobId) {
                // Delete the current job from the backend
                await fetchJson(`${apiBase}/api/discovery-jobs/${jobId}`, {
                    method: 'DELETE',
                });
                console.log('[DISCOVERY WIZARD] Deleted job:', jobId);
            }

            // Reset all state to initial values
            setCurrentStep(1);
            setJobId(null);
            setConfig(DEFAULT_CONFIG);
            setJobData(null);
            setError(null);
            setEditedTypes([]);
            setEditedRelationships([]);
            setPackConfig(null);
            setHasRestoredJob(false);
            setUserStartedFresh(true); // Prevent useEffect from loading jobs again

            console.log('[DISCOVERY WIZARD] State reset complete, starting fresh');
        } catch (err) {
            console.error('[DISCOVERY WIZARD] Failed to start fresh:', err);
            setError(err instanceof Error ? err.message : 'Failed to reset wizard');
        }
    };

    // Render current step
    const renderStep = () => {
        switch (currentStep) {
            case 1:
                return (
                    <Step1_Configure
                        projectId={projectId}
                        config={config}
                        onConfigChange={setConfig}
                        onStart={handleStartDiscovery}
                        onCancel={handleClose}
                    />
                );
            case 2:
                return (
                    <Step2_Analyzing
                        jobId={jobId!}
                        onComplete={handleTypesExtracted}
                        onCancel={handleCancelJob}
                    />
                );
            case 3:
                return (
                    <Step3_ReviewTypes
                        types={editedTypes}
                        onTypesChange={setEditedTypes}
                        onNext={handleTypesReviewed}
                        onBack={() => setCurrentStep(1)}
                    />
                );
            case 4:
                return (
                    <Step4_ReviewRelationships
                        relationships={editedRelationships}
                        onRelationshipsChange={setEditedRelationships}
                        onGeneratePack={handleReviewRelationshipsComplete}
                        onBack={() => setCurrentStep(3)}
                    />
                );
            case 4.5:
                return (
                    <Step4_5_ConfigurePack
                        initialPackName={`Discovery Pack - ${new Date().toLocaleDateString()}`}
                        onNext={handlePackConfigured}
                        onBack={() => setCurrentStep(4)}
                    />
                );
            case 5:
                return (
                    <Step5_Complete
                        jobData={jobData!}
                        includedTypes={editedTypes}
                        includedRelationships={editedRelationships}
                        packConfig={packConfig}
                        onClose={handleClose}
                        onStartNew={() => {
                            setCurrentStep(1);
                            setJobId(null);
                            setConfig(DEFAULT_CONFIG);
                            setJobData(null);
                            setEditedTypes([]);
                            setEditedRelationships([]);
                            setPackConfig(null);
                        }}
                    />
                );
            default:
                return null;
        }
    };

    return (
        <dialog ref={dialogRef} className="modal" onClose={handleClose}>
            <div className="max-w-4xl modal-box">
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h2 className="flex items-center gap-2 font-bold text-2xl">
                            <Icon icon="lucide--wand-sparkles" className="size-6 text-primary" />
                            Auto-Discovery Wizard
                        </h2>
                        <p className="mt-1 text-sm text-base-content/70">
                            Let AI discover object types and relationships from your documents
                        </p>
                    </div>
                    <button
                        className="btn btn-sm btn-circle btn-ghost"
                        onClick={handleClose}
                        aria-label="Close wizard"
                    >
                        <Icon icon="lucide--x" className="size-5" />
                    </button>
                </div>

                {/* Progress Steps */}
                <div className="mb-6">
                    <ul className="w-full steps steps-horizontal">
                        <li className={`step ${currentStep >= 1 ? 'step-primary' : ''}`}>
                            Configure
                        </li>
                        <li className={`step ${currentStep >= 2 ? 'step-primary' : ''}`}>
                            Analyzing
                        </li>
                        <li className={`step ${currentStep >= 3 ? 'step-primary' : ''}`}>
                            Review Types
                        </li>
                        <li className={`step ${currentStep >= 4 ? 'step-primary' : ''}`}>
                            Review Relations
                        </li>
                        <li className={`step ${currentStep >= 5 ? 'step-primary' : ''}`}>
                            Complete
                        </li>
                    </ul>
                </div>

                {/* Error Alert */}
                {error && (
                    <div role="alert" className="mb-4 alert alert-error">
                        <Icon icon="lucide--alert-circle" className="size-5" />
                        <span>{error}</span>
                        <button
                            className="btn btn-sm btn-ghost"
                            onClick={() => setError(null)}
                            aria-label="Dismiss error"
                        >
                            <Icon icon="lucide--x" className="size-4" />
                        </button>
                    </div>
                )}

                {/* Loading Previous Job */}
                {isLoadingPreviousJob && (
                    <div role="alert" className="mb-4 alert alert-info">
                        <Icon icon="lucide--loader-2" className="size-5 animate-spin" />
                        <span>Checking for in-progress discovery jobs...</span>
                    </div>
                )}

                {/* State Restored Notice */}
                {hasRestoredJob && currentStep > 1 && !isLoadingPreviousJob && (
                    <div role="alert" className="mb-4 alert alert-info">
                        <Icon icon="lucide--info" className="size-5" />
                        <div className="flex-1">
                            <span>Your previous discovery session was restored.</span>
                        </div>
                        <button
                            className="btn btn-sm btn-ghost"
                            onClick={handleStartFresh}
                            title="Cancel current job and start over from the beginning"
                        >
                            Start Fresh
                        </button>
                    </div>
                )}

                {/* Step Content */}
                <div className="min-h-[400px]">
                    {renderStep()}
                </div>
            </div>

            {/* Backdrop */}
            <form method="dialog" className="modal-backdrop">
                <button onClick={handleClose}>close</button>
            </form>
        </dialog>
    );
}
