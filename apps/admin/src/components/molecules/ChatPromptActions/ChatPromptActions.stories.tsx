import type { Meta, StoryObj } from '@storybook/react';
import { ChatPromptActions, type ChatPromptActionsProps } from './index';

const meta: Meta<typeof ChatPromptActions> = {
    title: 'Molecules/ChatPromptActions',
    component: ChatPromptActions,
    parameters: {
        docs: {
            description: {
                component:
                    'Inline action bar used beneath the chat composer (attach files, toggle privacy, etc.). Each control emits callbacks consumed by higher-level chat container.',
            },
        },
    },
    tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {} as ChatPromptActionsProps,
    render: (args) => (
        <div className="p-4 max-w-md">
            <ChatPromptActions {...args} />
        </div>
    ),
};
