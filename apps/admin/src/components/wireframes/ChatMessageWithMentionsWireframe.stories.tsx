import type { Meta, StoryObj } from '@storybook/react';
import { ChatMessageWithMentionsWireframe, ChatMessageWithMentionsWireframeProps } from './ChatMessageWithMentionsWireframe';

const meta: Meta<typeof ChatMessageWithMentionsWireframe> = {
    title: 'Wireframes/Chat/MessageWithMentions',
    component: ChatMessageWithMentionsWireframe,
    args: { state: 'resolved', mentions: 3 } satisfies Partial<ChatMessageWithMentionsWireframeProps>,
    parameters: {
        docs: { description: { component: 'Low‑fi wireframe for chat assistant message with object mention pills.' } },
    },
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Resolved: Story = {};
export const Streaming: Story = { args: { state: 'streaming' } };
export const ManyMentions: Story = { args: { mentions: 8 } };
