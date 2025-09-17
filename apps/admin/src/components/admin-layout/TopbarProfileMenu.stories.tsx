import type { Meta, StoryObj } from "@storybook/react";
import { TopbarProfileMenu } from "./TopbarProfileMenu";

const meta: Meta<typeof TopbarProfileMenu> = {
    title: "AdminLayout/Topbar/ProfileMenu",
    component: TopbarProfileMenu,
    parameters: {
        docs: {
            description: {
                component: `Avatar trigger + dropdown containing account actions (profile, sign out). Consumes auth context (or mock) in Storybook; replace handlers for isolated visual testing.`,
            },
        },
    },
    tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof TopbarProfileMenu>;

export const Default: Story = {
    render: () => (
        <div className="p-4">
            <TopbarProfileMenu />
        </div>
    ),
};
