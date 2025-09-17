import type { Meta, StoryObj } from "@storybook/react";
import { TopbarLanguageMenu } from "./TopbarLanguageMenu";

const meta: Meta<typeof TopbarLanguageMenu> = {
    title: "AdminLayout/Topbar/LanguageMenu",
    component: TopbarLanguageMenu,
    parameters: {
        docs: {
            description: {
                component: `Dropdown listing available UI languages. Integrates with global config provider to persist selection (localStorage) and trigger rtl/ltr updates when necessary.`,
            },
        },
    },
    tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof TopbarLanguageMenu>;

export const Default: Story = {
    render: () => (
        <div className="p-4">
            <TopbarLanguageMenu />
        </div>
    ),
};
