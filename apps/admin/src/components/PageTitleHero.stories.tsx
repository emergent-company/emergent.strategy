import type { Meta, StoryObj } from "@storybook/react";
import { PageTitleHero } from "./PageTitle";
const meta: Meta<typeof PageTitleHero> = {
    title: "Core/PageTitleHero",
    component: PageTitleHero,
    args: {
        label: "Component",
        title: "Buttons",
        description: "Reusable buttons that follow the Nexus design system.",
    },
    parameters: {
        docs: {
            description: {
                component: "Hero variant of page title with optional label and supporting description.",
            },
        },
    },
    tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithoutLabel: Story = { args: { label: undefined } };
