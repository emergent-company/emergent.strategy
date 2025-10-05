import type { Meta, StoryObj } from '@storybook/react';
import ProjectAutoExtractionSettingsPage from './auto-extraction';

const meta = {
    title: 'Pages/Settings/Project/AutoExtraction',
    component: ProjectAutoExtractionSettingsPage,
    parameters: {
        layout: 'fullscreen',
    },
    decorators: [
        (Story) => (
            <div style={{ minHeight: '100vh', background: 'oklch(var(--b2))' }}>
                <Story />
            </div>
        ),
    ],
} satisfies Meta<typeof ProjectAutoExtractionSettingsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default auto-extraction settings page.
 * Shows configuration options for automatic object extraction from documents.
 */
export const Default: Story = {};

/**
 * Auto-extraction settings page with auto-extraction enabled.
 * Note: This story requires mocking the API responses to show enabled state.
 */
export const WithAutoExtractionEnabled: Story = {
    parameters: {
        docs: {
            description: {
                story: 'When auto-extraction is enabled, additional configuration options are visible including object types, confidence threshold, and notification settings.',
            },
        },
    },
};

/**
 * Auto-extraction settings page showing all object types selected.
 * Demonstrates the multi-select functionality for object types.
 */
export const AllTypesSelected: Story = {
    parameters: {
        docs: {
            description: {
                story: 'All available object types (Requirements, Decisions, Features, Tasks, Risks, Issues, Stakeholders, Constraints) can be selected for extraction.',
            },
        },
    },
};

/**
 * Auto-extraction settings with high confidence threshold.
 * Shows the confidence slider at maximum value for precision.
 */
export const HighConfidenceThreshold: Story = {
    parameters: {
        docs: {
            description: {
                story: 'Higher confidence threshold (0.9+) results in fewer but higher-quality extracted objects.',
            },
        },
    },
};
