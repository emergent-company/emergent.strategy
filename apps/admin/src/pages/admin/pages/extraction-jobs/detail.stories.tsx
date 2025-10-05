import type { Meta, StoryObj } from '@storybook/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ExtractionJobDetailPage } from './detail';

/**
 * Note: This story displays the detail page. 
 * In a real app, the page fetches data from the API.
 * For Storybook, you'll need to have a running backend with test data.
 */

const meta: Meta<typeof ExtractionJobDetailPage> = {
    title: 'Pages/Extraction Jobs/Detail Page',
    component: ExtractionJobDetailPage,
    parameters: {
        layout: 'fullscreen',
    },
    decorators: [
        (Story, { parameters }) => {
            // Use a test job ID - you'll need to create jobs in your test backend
            const jobId = parameters.jobId || 'test-job-id';
            return (
                <MemoryRouter initialEntries={[`/admin/extraction-jobs/${jobId}`]}>
                    <Routes>
                        <Route path="/admin/extraction-jobs/:jobId" element={<Story />} />
                    </Routes>
                </MemoryRouter>
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
        jobId: 'test-job-1',
    },
};
