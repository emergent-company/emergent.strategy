import type { Meta, StoryObj } from '@storybook/react';
import { ObjectDetailModal } from './ObjectDetailModal';
import { GraphObject } from '../ObjectBrowser/ObjectBrowser';

const meta = {
    title: 'Organisms/ObjectDetailModal',
    component: ObjectDetailModal,
    parameters: {
        layout: 'fullscreen',
        docs: {
            description: {
                component: 'Modal that displays full details of a graph object, including all properties and extraction metadata.',
            },
        },
    },
    tags: ['autodocs'],
} satisfies Meta<typeof ObjectDetailModal>;

export default meta;
type Story = StoryObj<typeof meta>;

const sampleExtractedObject: GraphObject = {
    id: 'd7dae6b6-adc7-48c8-8fa7-0c3e14cde2ca',
    name: 'Uncertainty of AI success',
    type: 'Risk',
    source: 'document',
    updated_at: '2025-10-05T10:30:00Z',
    relationship_count: 3,
    properties: {
        name: 'Uncertainty of AI success',
        title: 'Uncertainty of AI success',
        description: 'It is hard to predict the exact success rate of AI in generating technical specifications and code, even with small contexts.',
        impact: 'Potential for AI-generated code/specs to not meet quality standards or project requirements, leading to rework or project delays.',
        probability: 'medium',
        severity: 'medium',
        status: 'identified',
        risk_type: 'technical',
        mitigation_strategy: 'Implement human quality control for AI-generated outputs and start with small, manageable contexts to build confidence and refine the process.',
        tags: ['AI development', 'project uncertainty'],
        _extraction_job_id: '651f2808-b808-4fd0-baf7-b39d50a93f31',
        _extraction_source: 'document',
        _extraction_source_id: '8cefb6b7-b5a7-4011-9209-e31f4587d964',
        _extraction_confidence: 0.936111111111111,
        _extraction_llm_confidence: 0.9,
    },
};

const sampleManualObject: GraphObject = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'User Authentication System',
    type: 'Feature',
    source: 'github',
    updated_at: '2025-10-01T15:45:00Z',
    relationship_count: 12,
    properties: {
        name: 'User Authentication System',
        description: 'Implement OAuth 2.0 and SAML authentication',
        status: 'in_progress',
        priority: 'high',
        assignee: 'John Doe',
        due_date: '2025-10-15',
        tags: ['authentication', 'security', 'oauth'],
    },
};

const sampleMinimalObject: GraphObject = {
    id: 'abc123def-456-789-ghi-jklmnopqrst',
    name: 'Simple Task',
    type: 'Task',
    updated_at: '2025-10-05T08:00:00Z',
    properties: {
        title: 'Review pull request',
        status: 'open',
    },
};

/**
 * Default view showing an extracted object with full extraction metadata,
 * including confidence score, source document link, and all extracted properties.
 */
export const ExtractedObject: Story = {
    args: {
        object: sampleExtractedObject,
        isOpen: true,
        onClose: () => console.log('Modal closed'),
    },
};

/**
 * Shows a manually created object without extraction metadata.
 * Notice the absence of the "Extraction Metadata" section.
 */
export const ManualObject: Story = {
    args: {
        object: sampleManualObject,
        isOpen: true,
        onClose: () => console.log('Modal closed'),
    },
};

/**
 * Shows an object with minimal properties.
 * Demonstrates graceful handling of sparse data.
 */
export const MinimalObject: Story = {
    args: {
        object: sampleMinimalObject,
        isOpen: true,
        onClose: () => console.log('Modal closed'),
    },
};

/**
 * Shows high-confidence extraction (>80%).
 * Notice the green progress bar and success color.
 */
export const HighConfidence: Story = {
    args: {
        object: {
            ...sampleExtractedObject,
            properties: {
                ...sampleExtractedObject.properties,
                _extraction_confidence: 0.95,
            },
        },
        isOpen: true,
        onClose: () => console.log('Modal closed'),
    },
};

/**
 * Shows medium-confidence extraction (60-80%).
 * Notice the yellow/warning progress bar.
 */
export const MediumConfidence: Story = {
    args: {
        object: {
            ...sampleExtractedObject,
            properties: {
                ...sampleExtractedObject.properties,
                _extraction_confidence: 0.68,
            },
        },
        isOpen: true,
        onClose: () => console.log('Modal closed'),
    },
};

/**
 * Shows low-confidence extraction (<60%).
 * Notice the red/error progress bar indicating the extraction should be reviewed.
 */
export const LowConfidence: Story = {
    args: {
        object: {
            ...sampleExtractedObject,
            properties: {
                ...sampleExtractedObject.properties,
                _extraction_confidence: 0.45,
            },
        },
        isOpen: true,
        onClose: () => console.log('Modal closed'),
    },
};

/**
 * Shows an object with array properties.
 * Arrays are displayed as badges for better visual presentation.
 */
export const WithArrayProperties: Story = {
    args: {
        object: {
            ...sampleExtractedObject,
            properties: {
                ...sampleExtractedObject.properties,
                tags: ['AI', 'machine learning', 'automation', 'testing', 'quality assurance'],
                technologies: ['Python', 'TensorFlow', 'PyTorch'],
            },
        },
        isOpen: true,
        onClose: () => console.log('Modal closed'),
    },
};

/**
 * Shows an object with nested object properties.
 * Nested objects are displayed as formatted JSON for readability.
 */
export const WithNestedProperties: Story = {
    args: {
        object: {
            ...sampleExtractedObject,
            properties: {
                ...sampleExtractedObject.properties,
                metadata: {
                    created_by: 'AI Assistant',
                    version: '1.2.3',
                    environment: 'production',
                },
                config: {
                    enabled: true,
                    threshold: 0.8,
                    max_retries: 3,
                },
            },
        },
        isOpen: true,
        onClose: () => console.log('Modal closed'),
    },
};

/**
 * Modal closed state - should not be visible.
 */
export const Closed: Story = {
    args: {
        object: sampleExtractedObject,
        isOpen: false,
        onClose: () => console.log('Modal closed'),
    },
};

/**
 * No object selected - should not be visible.
 */
export const NoObject: Story = {
    args: {
        object: null,
        isOpen: true,
        onClose: () => console.log('Modal closed'),
    },
};
