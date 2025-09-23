import type { Meta, StoryObj } from '@storybook/react';
import { ChatPromptComposer, type ChatPromptComposerProps } from './index';
import { action } from '@/stories';

const meta: Meta<typeof ChatPromptComposer> = {
    title: 'Molecules/ChatPromptComposer',
    component: ChatPromptComposer,
    args: {
        defaultPrivate: false,
        placeholder: 'Let us know what you need...',
        onSubmit: action('onSubmit'),
    } as ChatPromptComposerProps,
    parameters: {
        docs: {
            description: {
                component:
                    'Rich chat input with multiline textarea, privacy toggle and submit button. Provide onSubmit; when defaultPrivate is true the composer initializes in private mode.',
            },
        },
    },
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const PrivateByDefault: Story = { args: { defaultPrivate: true } };
