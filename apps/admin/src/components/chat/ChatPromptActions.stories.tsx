import type { Meta, StoryObj } from "@storybook/react";
import { ChatPromptActions } from "./ChatPromptActions";
const meta: Meta<typeof ChatPromptActions> = {
    title: "Chat/ChatPromptActions",
    component: ChatPromptActions,
    parameters: {
        docs: {
            description: {
                component: `Inline action bar used beneath the chat composer (attach files, toggle privacy, etc.). Each control emits callbacks consumed by higher-level chat container.`,
            },
        },
    },
    tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="p-4">
            <ChatPromptActions />
        </div>
    ),
};
