import type { Meta, StoryObj } from "@storybook/react";
import { Topbar } from "./Topbar";

const meta: Meta<typeof Topbar> = {
    title: "Components Layout/Topbar",
    component: Topbar,
    parameters: {
        docs: {
            description: {
                component: `Primary horizontal navigation bar containing quick actions, search and user menu. Responsive collapse ensures usable experience on narrow viewports.`,
            },
        },
    },
    tags: ["autodocs"],
};
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
