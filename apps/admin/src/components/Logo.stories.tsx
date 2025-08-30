import type { Meta, StoryObj } from "@storybook/react";
import { Logo } from "./Logo";

const meta = {
    title: "Core/Logo",
    component: Logo,
    parameters: {
        layout: "centered",
    },
    args: {
        className: "h-8",
    },
} satisfies Meta<typeof Logo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
