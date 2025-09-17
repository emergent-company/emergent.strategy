import type { Meta, StoryObj } from "@storybook/react";
import { Footer } from "./Footer";

const meta: Meta<typeof Footer> = {
    title: "Components Layout/Footer",
    component: Footer,
    parameters: {
        docs: {
            description: {
                component: `Generic footer used across component showcase pages. Displays simple copyright text and optional links region.`,
            },
        },
    },
    tags: ["autodocs"],
};
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
