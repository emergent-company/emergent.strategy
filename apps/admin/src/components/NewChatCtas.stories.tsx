import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { NewChatCtas, type NewChatCard } from "./NewChatCtas";

const meta: Meta<typeof NewChatCtas> = {
    title: "Chat/NewChatCtas",
    component: NewChatCtas,
    args: {
        onPickPrompt: fn(),
        onSubmit: fn(),
    },
};

export default meta;
type Story = StoryObj<typeof NewChatCtas>;

export const Default: Story = {};

export const CustomCards: Story = {
    args: {
        cards: [
            { icon: "lucide--file-text", title: "Summarize", desc: "Summarize text.", prompt: "Summarize:" },
            { icon: "lucide--alarm-clock", title: "Deadlines", desc: "List deadlines.", prompt: "Find deadlines:" },
            { icon: "lucide--check", title: "Decisions", desc: "Show decisions.", prompt: "Decisions:" },
        ] as NewChatCard[],
    },
};
