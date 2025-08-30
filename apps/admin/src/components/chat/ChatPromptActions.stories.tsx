import type { Meta, StoryObj } from "@storybook/react";
import { ChatPromptActions } from "./ChatPromptActions";

const meta: Meta<typeof ChatPromptActions> = {
    title: "Chat/ChatPromptActions",
    component: ChatPromptActions,
};

export default meta;
type Story = StoryObj<typeof ChatPromptActions>;

export const Default: Story = {
    render: () => (
        <div className="p-4">
            <ChatPromptActions />
        </div>
    ),
};
