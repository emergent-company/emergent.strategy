import type { Meta, StoryObj } from "@storybook/react";
import { Logo } from "./Logo";
const meta: Meta<typeof Logo> = {
    title: "Core/Logo",
    component: Logo,
    args: { className: "h-8" },
    parameters: {
        layout: "centered",
        docs: {
            description: {
                component: "Brand mark used across the application. Adjust size via Tailwind height classes (e.g. h-6, h-8).",
            },
        },
    },
    tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
