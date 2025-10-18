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
        llm: {
            prompt_template: 'Extract company + contact entities',
            temperature: 0.2,
            model: 'gpt-4.1-mini',
        },
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
            register: () => () => {},
            update: () => {},
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
