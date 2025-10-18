import { useEffect, useLayoutEffect, useRef, type MutableRefObject, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Route, Routes } from 'react-router';

import { useConfig } from '@/contexts/config';
import { type ExtractionJob } from '@/api/extraction-jobs';

import { ExtractionJobDetailPage } from './detail';

/**
 * Note: This story displays the detail page. 
 * In a real app, the page fetches data from the API.
 * For Storybook, you'll need to have a running backend with test data.
 */

const defaultJob: ExtractionJob = {
    id: 'test-job-1',
    organization_id: 'org-demo',
    project_id: 'proj-demo',
    source_type: 'document',
    source_id: 'doc-123',
    source_metadata: {
        filename: 'demo-proposal.pdf',
        size_bytes: 458123,
        uploader: 'Alex Rivera',
    },
    extraction_config: {
        target_types: ['company', 'contact'],
        auto_create_types: true,
        confidence_threshold: 0.78,
        notify_on_completion: true,
    },
    status: 'running',
    total_items: 128,
    processed_items: 56,
    successful_items: 48,
    failed_items: 8,
    discovered_types: ['company', 'contact', 'opportunity'],
    created_objects: Array.from({ length: 24 }, (_, index) => `obj-${(index + 1).toString().padStart(4, '0')}`),
    error_message: undefined,
    error_details: undefined,
    debug_info: {
        provider: 'LangChain-Gemini',
        job_duration_ms: 4200,
        total_entities: 24,
        types_processed: 3,
        entity_outcomes: {
            created: 18,
            merged: 3,
            skipped: 1,
            rejected: 2,
            failed: 0,
        },
        llm_calls: [
            {
                type: 'company',
                input: {
                    prompt: 'Extract company entities from the provided document.',
                    allowed_types: ['company'],
                },
                output: {
                    entities: [{ name: 'Acme Corp', confidence: 0.92 }],
                },
                entities_found: 12,
                duration_ms: 1380,
                timestamp: new Date(Date.now() - 4000).toISOString(),
                model: 'gemini-2.5-flash',
                status: 'success',
            },
            {
                type: 'contact',
                input: {
                    prompt: 'Extract contact entities from the provided document.',
                    allowed_types: ['contact'],
                },
                output: {
                    entities: [{ name: 'Jordan Lee', confidence: 0.88 }],
                },
                entities_found: 8,
                duration_ms: 980,
                timestamp: new Date(Date.now() - 3500).toISOString(),
                model: 'gemini-2.5-flash',
                status: 'success',
            },
            {
                type: 'opportunity',
                input: {
                    prompt: 'Extract opportunity entities from the provided document.',
                    allowed_types: ['opportunity'],
                },
                error: 'LLM schema validation failed',
                duration_ms: 450,
                timestamp: new Date(Date.now() - 3000).toISOString(),
                model: 'gemini-2.5-flash',
                status: 'error',
            },
        ],
        timeline: [
            {
                step: 'job_started',
                status: 'info',
                timestamp: new Date(Date.now() - 5000).toISOString(),
                metadata: {
                    project_id: 'proj-demo',
                    source_type: 'document',
                },
            },
            {
                step: 'load_document',
                status: 'success',
                timestamp: new Date(Date.now() - 4800).toISOString(),
                duration_ms: 120,
                metadata: {
                    character_count: 58213,
                },
            },
            {
                step: 'llm_extract',
                status: 'success',
                timestamp: new Date(Date.now() - 4200).toISOString(),
                duration_ms: 2100,
                metadata: {
                    provider: 'LangChain-Gemini',
                    entities: 24,
                },
            },
            {
                step: 'graph_upsert',
                status: 'success',
                timestamp: new Date(Date.now() - 1800).toISOString(),
                duration_ms: 800,
                metadata: {
                    created: 18,
                    merged: 3,
                    review_required: 2,
                },
            },
            {
                step: 'job_completed',
                status: 'success',
                timestamp: new Date(Date.now() - 200).toISOString(),
                duration_ms: 200,
                metadata: {
                    created_objects: 18,
                    rejected: 2,
                },
            },
        ],
    },
    started_at: new Date(Date.now() - 7 * 60 * 1000).toISOString(),
    completed_at: undefined,
    created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
    subject_id: 'subject-42',
};

const meta: Meta<typeof ExtractionJobDetailPage> = {
    title: 'Pages/Extraction Jobs/Detail Page',
    component: ExtractionJobDetailPage,
    parameters: {
        layout: 'fullscreen',
        location: `/admin/extraction-jobs/${defaultJob.id}`,
    },
    decorators: [
        (Story, context) => {
            const parameters = context.parameters as { job?: ExtractionJob };
            const job = parameters.job ?? defaultJob;

            return (
                <MockExtractionJobStoryProvider job={job}>
                    <Routes>
                        <Route path="/admin/extraction-jobs/:jobId" element={<Story />} />
                    </Routes>
                </MockExtractionJobStoryProvider>
            );
        },
    ],
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default view - displays detail page
 * Note: Requires a backend with test extraction job data
 */
export const Default: Story = {
    parameters: {
        location: `/admin/extraction-jobs/${defaultJob.id}`,
        job: defaultJob,
    },
};

type MockExtractionJobStoryProviderProps = {
    job: ExtractionJob;
    children: ReactNode;
};

const MockExtractionJobStoryProvider = ({ job, children }: MockExtractionJobStoryProviderProps) => {
    const { setActiveOrg, setActiveProject } = useConfig();
    const jobStateRef = useRef<ExtractionJob>(job);
    const cleanupRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        jobStateRef.current = job;
        setActiveOrg(job.organization_id, 'Demo Org');
        setActiveProject(job.project_id, 'Demo Project');
        extractionJobFetchMock.update(job);
    }, [job, setActiveOrg, setActiveProject]);

    useLayoutEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        jobStateRef.current = job;
        cleanupRef.current = extractionJobFetchMock.register(jobStateRef);

        return () => {
            cleanupRef.current?.();
            cleanupRef.current = null;
        };
    }, [job]);

    return <>{children}</>;
};

type ExtractionJobRef = MutableRefObject<ExtractionJob>;

const extractionJobFetchMock = (() => {
    if (typeof window === 'undefined') {
        return {
            register: () => () => { },
            update: () => { },
        } as const;
    }

    let originalFetch: typeof fetch | null = null;
    let jobRef: ExtractionJobRef | null = null;

    const resolveUrl = (input: Parameters<typeof fetch>[0]): string => {
        if (typeof input === 'string') return input;
        if (input instanceof Request) return input.url;
        return '';
    };

    const buildJsonResponse = (body: unknown, init?: ResponseInit) =>
        new Response(JSON.stringify(body), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
            },
            ...init,
        });

    const ensurePatchedFetch = () => {
        if (originalFetch) {
            return;
        }

        originalFetch = window.fetch;
        window.fetch = async (input, init = {}) => {
            if (!jobRef || !originalFetch) {
                return originalFetch ? originalFetch(input, init) : fetch(input, init);
            }

            const job = jobRef.current;
            const url = resolveUrl(input);
            const method = (init?.method ?? 'GET').toUpperCase();

            if (url.includes(`/api/admin/extraction-jobs/${job.id}/cancel`) && method === 'POST') {
                jobRef.current = {
                    ...job,
                    status: 'cancelled',
                    completed_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                };
                return buildJsonResponse(jobRef.current);
            }

            if (url.includes(`/api/admin/extraction-jobs/${job.id}`)) {
                if (method === 'DELETE') {
                    return new Response(null, { status: 204 });
                }

                if (method === 'GET') {
                    return buildJsonResponse(jobRef.current);
                }
            }

            return originalFetch(input, init);
        };
    };

    return {
        register(ref: ExtractionJobRef) {
            jobRef = ref;
            ensurePatchedFetch();

            return () => {
                jobRef = null;
                if (originalFetch) {
                    window.fetch = originalFetch;
                    originalFetch = null;
                }
            };
        },
        update(job: ExtractionJob) {
            if (jobRef) {
                jobRef.current = job;
            }
        },
    } as const;
})();
