import type { Meta, StoryObj } from "@storybook/react";
import { MetaData } from "./MetaData";

const meta: Meta<typeof MetaData> = {
    title: "SEO/MetaData",
    component: MetaData,
    args: {
        title: "Sample Page",
        noIndex: false,
    },
};

export default meta;
type Story = StoryObj<typeof MetaData>;

export const Default: Story = {};

export const NoIndex: Story = {
    args: { noIndex: true },
};
