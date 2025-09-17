import type { Meta, StoryObj } from "@storybook/react";
import { ChatCtaCard } from "./ChatCtaCard";
import type { ChatCtaCardProps } from "./ChatCtaCard";
import { action } from "@/stories";

const meta: Meta<typeof ChatCtaCard> = {
    title: "Chat/ChatCtaCard",
    component: ChatCtaCard,
    parameters: {
        docs: {
            description: {
                component: `Call‑to‑action card surfaced contextually inside conversation list when user has no conversations or hits a usage boundary. Encourages upgrade or creation of first chat.`,
            },
        },
    },
    tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
