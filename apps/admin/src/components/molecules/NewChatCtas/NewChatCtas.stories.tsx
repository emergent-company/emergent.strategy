import type { Meta, StoryObj } from '@storybook/react';
import { NewChatCtas } from './';

const meta: Meta<typeof NewChatCtas> = {
    title: 'Molecules/NewChatCtas',
    component: NewChatCtas,
    args: {},
    parameters: {
        docs: {
            description: {
                component: 'Panel of curated prompt CTA cards plus an optional composer for starting a new chat.',
            },
        },
    },
    tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithoutComposer: Story = {
    args: {
        onSubmit: undefined,
    },
};

export const CustomCards: Story = {
    args: {
        cards: [
            { icon: 'lucide--lightbulb', title: 'Brainstorm', desc: 'Generate creative ideas', prompt: 'Brainstorm ideas about:' },
            { icon: 'lucide--list-tree', title: 'Outline', desc: 'Create document outline', prompt: 'Create a detailed outline for:' },
        ],
    },
};
