import type { Meta, StoryObj } from "@storybook/react";
import { Topbar } from "./Topbar";

const meta: Meta<typeof Topbar> = {
    title: "Components Layout/Topbar",
    component: Topbar,
};

export default meta;
type Story = StoryObj<typeof Topbar>;

export const Default: Story = {};
