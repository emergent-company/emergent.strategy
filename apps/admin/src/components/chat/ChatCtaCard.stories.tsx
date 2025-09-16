import type { Meta, StoryObj } from "@storybook/react";
import { ChatCtaCard, type ChatCtaCardProps } from "./ChatCtaCard";
import { action } from "@/stories";

const meta: Meta<typeof ChatCtaCard> = {
    title: "Chat/ChatCtaCard",
    component: ChatCtaCard,
    args: {
        icon: "lucide--sparkles",
        title: "Summarize Document",
        desc: "Get a concise summary of your document.",
        onPick: action('onPick'),
    } satisfies ChatCtaCardProps,
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
