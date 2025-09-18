import type { Meta, StoryObj } from "@storybook/react";
import { TopbarSearchButton } from "../layout/TopbarSearchButton";

const meta: Meta<typeof TopbarSearchButton> = {
    title: "Layout/Topbar/SearchButton",
    component: TopbarSearchButton,
    parameters: {
        docs: {
            description: {
                component: `Opens global command/search palette. In app environment this wires to a dialog / kbar surface; here it serves as visual & focus styles reference.`,
            },
        },
    },
    tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof TopbarSearchButton>;

export const Default: Story = {
    render: () => <TopbarSearchButton />,
};
