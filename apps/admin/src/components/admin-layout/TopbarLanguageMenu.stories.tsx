import type { Meta, StoryObj } from "@storybook/react";
import { TopbarLanguageMenu } from "./TopbarLanguageMenu";

const meta: Meta<typeof TopbarLanguageMenu> = {
    title: "Admin Layout/Topbar/TopbarLanguageMenu",
    component: TopbarLanguageMenu,
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
