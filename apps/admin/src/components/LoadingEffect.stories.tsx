import type { Meta, StoryObj } from "@storybook/react";
import { LoadingEffect } from "./LoadingEffect";

const meta = {
    title: "Feedback/LoadingEffect",
    component: LoadingEffect,
    parameters: { layout: "centered" },
    args: {
        width: 200,
        height: 24,
        className: "rounded-md",
    },
    argTypes: {
        width: { control: { type: "number" } },
        height: { control: { type: "number" } },
        className: { control: "text" },
    },
} satisfies Meta<typeof LoadingEffect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Large: Story = {
    args: { width: 320, height: 48 },
};
