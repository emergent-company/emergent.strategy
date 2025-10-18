import type { Meta, StoryObj } from '@storybook/react';
import { Route, Routes } from 'react-router';
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
        location: '/admin/extraction-jobs/test-job-1',
    },
    decorators: [
        (Story) => (
            <Routes>
                <Route path="/admin/extraction-jobs/:jobId" element={<Story />} />
            </Routes>
        ),
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
        location: '/admin/extraction-jobs/test-job-1',
    },
};
