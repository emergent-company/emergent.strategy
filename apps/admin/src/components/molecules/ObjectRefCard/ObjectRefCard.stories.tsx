import type { Meta, StoryObj } from '@storybook/react';
import { ObjectRefCard } from './ObjectRefCard';

const meta = {
    title: 'Molecules/ObjectRefCard',
    component: ObjectRefCard,
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: 'Compact card for displaying entity references in chat responses. Designed to be clickable and open full details in a modal. Follows the same design pattern as ExtractionJobCard and IntegrationCard.',
            },
        },
    },
    tags: ['autodocs'],
} satisfies Meta<typeof ObjectRefCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default object card with all fields populated.
 * Shows a Risk entity with name, type, and summary.
 */
export const Default: Story = {
    args: {
        id: 'd7dae6b6-adc7-48c8-8fa7-0c3e14cde2ca',
        type: 'Risk',
        name: 'Uncertainty of AI success',
        summary: 'Hard to predict exact success rate of AI in generating specifications',
        onClick: () => console.log('Card clicked: d7dae6b6-adc7-48c8-8fa7-0c3e14cde2ca'),
    },
};

/**
 * Card without optional summary field.
 * Shows how the card adapts when only name and type are provided.
 */
export const WithoutSummary: Story = {
    args: {
        id: 'd7dae6b6-adc7-48c8-8fa7-0c3e14cde2ca',
        type: 'Decision',
        name: 'Use React for frontend',
        onClick: () => console.log('Card clicked'),
    },
};

/**
 * Card with very long name and summary to test truncation.
 * Name should truncate with ellipsis, summary should show single line with clamp.
 */
export const LongText: Story = {
    args: {
        id: 'd7dae6b6-adc7-48c8-8fa7-0c3e14cde2ca',
        type: 'Feature',
        name: 'Implement comprehensive AI-powered extraction system with multiple entity types and relationship detection',
        summary: 'This is a very long summary that should be truncated to one line to maintain compact layout and prevent the card from becoming too tall',
        onClick: () => console.log('Card clicked'),
    },
};

/**
 * Short name and summary showing optimal card height.
 */
export const ShortText: Story = {
    args: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        type: 'Task',
        name: 'Setup CI/CD',
        summary: 'Configure GitHub Actions',
        onClick: () => console.log('Card clicked'),
    },
};

/**
 * Multiple cards stacked vertically as they would appear in chat.
 * Demonstrates spacing and visual hierarchy.
 */
export const MultipleCards = {
    render: () => (
        <div className="space-y-2 max-w-md">
            <ObjectRefCard
                id="1"
                type="Decision"
                name="Use React for frontend"
                summary="Modern framework with strong ecosystem"
                onClick={() => console.log('Decision clicked')}
            />
            <ObjectRefCard
                id="2"
                type="Risk"
                name="Performance bottleneck"
                summary="Large dataset queries may timeout"
                onClick={() => console.log('Risk clicked')}
            />
            <ObjectRefCard
                id="3"
                type="Feature"
                name="Graph visualization"
                summary="Interactive D3.js based relationship explorer"
                onClick={() => console.log('Feature clicked')}
            />
            <ObjectRefCard
                id="4"
                type="Task"
                name="Write documentation"
                onClick={() => console.log('Task clicked')}
            />
            <ObjectRefCard
                id="5"
                type="Decision"
                name="Adopt TypeScript for type safety"
                summary="Reduces bugs and improves developer experience"
                onClick={() => console.log('Decision 2 clicked')}
            />
        </div>
    ),
};

/**
 * Different entity types showing badge variations.
 */
export const DifferentTypes = {
    render: () => (
        <div className="space-y-2 max-w-md">
            <ObjectRefCard
                id="1"
                type="Decision"
                name="Architecture decision"
                summary="Use microservices pattern"
                onClick={() => console.log('Decision')}
            />
            <ObjectRefCard
                id="2"
                type="Risk"
                name="Security risk"
                summary="Potential data breach vulnerability"
                onClick={() => console.log('Risk')}
            />
            <ObjectRefCard
                id="3"
                type="Feature"
                name="New feature"
                summary="User authentication with OAuth"
                onClick={() => console.log('Feature')}
            />
            <ObjectRefCard
                id="4"
                type="Task"
                name="Development task"
                summary="Implement API endpoint"
                onClick={() => console.log('Task')}
            />
            <ObjectRefCard
                id="5"
                type="Bug"
                name="Critical bug"
                summary="Memory leak in production"
                onClick={() => console.log('Bug')}
            />
            <ObjectRefCard
                id="6"
                type="Document"
                name="Technical specification"
                summary="API design documentation"
                onClick={() => console.log('Document')}
            />
        </div>
    ),
};

/**
 * Responsive layout showing how cards adapt to different widths.
 */
export const ResponsiveWidths = {
    render: () => (
        <div className="space-y-4">
            <div>
                <p className="mb-2 text-xs text-base-content/60">Mobile (320px)</p>
                <div className="w-80">
                    <ObjectRefCard
                        id="1"
                        type="Risk"
                        name="Very long entity name that will be truncated"
                        summary="This summary is also quite long and will be clamped to a single line"
                        onClick={() => console.log('Clicked')}
                    />
                </div>
            </div>
            
            <div>
                <p className="mb-2 text-xs text-base-content/60">Tablet (640px)</p>
                <div className="w-[640px]">
                    <ObjectRefCard
                        id="2"
                        type="Feature"
                        name="Very long entity name that will be truncated"
                        summary="This summary is also quite long and will be clamped to a single line"
                        onClick={() => console.log('Clicked')}
                    />
                </div>
            </div>
            
            <div>
                <p className="mb-2 text-xs text-base-content/60">Desktop (1024px)</p>
                <div className="w-[1024px]">
                    <ObjectRefCard
                        id="3"
                        type="Decision"
                        name="Very long entity name that will be truncated"
                        summary="This summary is also quite long and will be clamped to a single line"
                        onClick={() => console.log('Clicked')}
                    />
                </div>
            </div>
        </div>
    ),
};
