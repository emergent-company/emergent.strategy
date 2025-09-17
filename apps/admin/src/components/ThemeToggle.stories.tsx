import type { Meta, StoryObj } from "@storybook/react";
import { ThemeToggle } from "./ThemeToggle";
const meta: Meta<typeof ThemeToggle> = {
    title: "Core/ThemeToggle",
    component: ThemeToggle,
    args: {
        className: "btn btn-ghost",
        iconClass: "size-5",
    },
    parameters: {
        layout: "centered",
        docs: {
            description: { component: "Switches between light, dark and system themes via the global config provider." },
        },
    },
    argTypes: {
        className: { control: "text" },
        iconClass: { control: "text" },
        onClick: { action: "clicked" },
    },
    tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
