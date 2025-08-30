import type { Meta, StoryObj } from "@storybook/react";
import { ThemeToggle } from "./ThemeToggle";

const meta = {
    title: "Core/ThemeToggle",
    component: ThemeToggle,
    parameters: { layout: "centered" },
    args: {
        className: "btn btn-ghost",
        iconClass: "size-5",
    },
    argTypes: {
        className: { control: "text" },
        iconClass: { control: "text" },
        onClick: { action: "clicked" },
    },
} satisfies Meta<typeof ThemeToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
