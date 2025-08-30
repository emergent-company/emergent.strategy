import type { Meta, StoryObj } from "@storybook/react";
import { ComponentPageTitle } from "./ComponentPageTitle";

const meta = {
    title: "Core/ComponentPageTitle",
    component: ComponentPageTitle,
    args: {
        label: "Component",
        title: "Buttons",
        description: "Reusable buttons that follow the Nexus design system.",
    },
} satisfies Meta<typeof ComponentPageTitle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithoutLabel: Story = {
    args: { label: undefined },
};
