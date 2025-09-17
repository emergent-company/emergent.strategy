import type { Meta, StoryObj } from "@storybook/react";
import { ChatPromptComposer } from "./ChatPromptComposer";
import { action } from "@/stories";
const meta: Meta<typeof ChatPromptComposer> = {
    title: "Chat/ChatPromptComposer",
    component: ChatPromptComposer,
    args: {
        defaultPrivate: false,
        placeholder: "Let us know what you need...",
        onSubmit: action('onSubmit'),
    },
    parameters: {
        docs: {
            description: {
                component: `Rich chat input with multiline textarea, privacy toggle and submit shortcut (Enter). Provide \`onSubmit\` handler; when \`defaultPrivate\` is true the composer initializes in private mode.`,
            },
        },
    },
    tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const PrivateByDefault: Story = { args: { defaultPrivate: true } };
