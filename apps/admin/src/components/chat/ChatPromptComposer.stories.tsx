import type { Meta, StoryObj } from "@storybook/react";
import { ChatPromptComposer } from "./ChatPromptComposer";
import { fn } from "@storybook/test";

const meta: Meta<typeof ChatPromptComposer> = {
    title: "Chat/ChatPromptComposer",
    component: ChatPromptComposer,
    args: {
        defaultPrivate: false,
        placeholder: "Let us know what you need...",
        onSubmit: fn(),
    },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const PrivateByDefault: Story = {
    args: { defaultPrivate: true },
};
