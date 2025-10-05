import type { Meta, StoryObj } from '@storybook/react';
import { ExtractionConfigModal } from './ExtractionConfigModal';
import { useState } from 'react';

const meta: Meta<typeof ExtractionConfigModal> = {
    title: 'Organisms/Extraction Config Modal',
    component: ExtractionConfigModal,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Interactive modal with state management
 */
function InteractiveModal() {
    const [isOpen, setIsOpen] = useState(true);

    return (
        <div>
            <button className="btn btn-primary" onClick={() => setIsOpen(true)}>
                Open Modal
            </button>
            <ExtractionConfigModal
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                onConfirm={(config) => {
                    console.log('Extraction config:', config);
                    alert(`Starting extraction with ${config.entity_types.length} entity types`);
                    setIsOpen(false);
                }}
                documentName="meeting-notes-2024-10-04.md"
            />
        </div>
    );
}

/**
 * Default modal state - ready to configure extraction
 */
export const Default: Story = {
    render: () => <InteractiveModal />,
};

/**
 * Loading state while starting extraction
 */
export const Loading: Story = {
    args: {
        isOpen: true,
        onClose: () => console.log('Close clicked'),
        onConfirm: () => console.log('Confirm clicked'),
        isLoading: true,
        documentName: 'requirements-specification.pdf',
    },
};

/**
 * Without document name
 */
export const NoDocumentName: Story = {
    args: {
        isOpen: true,
        onClose: () => console.log('Close clicked'),
        onConfirm: (config) => console.log('Config:', config),
        isLoading: false,
    },
};
