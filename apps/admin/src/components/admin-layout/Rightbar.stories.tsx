import type { Meta, StoryObj } from "@storybook/react";
import { useEffect } from "react";
import { Rightbar } from "./Rightbar";

const meta: Meta<typeof Rightbar> = {
    title: "AdminLayout/Rightbar/Container",
    component: Rightbar,
    parameters: {
        docs: {
            description: {
                component: `Customization drawer housing theme, font, direction and sidebar palette selectors. Story auto-opens the drawer by checking its toggle input on mount.`,
            },
        },
    },
    tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Rightbar>;

export const Default: Story = {
    render: () => {
        const AutoOpen = () => {
            useEffect(() => {
                const el = document.getElementById("layout-rightbar-drawer") as HTMLInputElement | null;
                if (el && !el.checked) el.checked = true;
            }, []);
            return (
                <div className="h-[480px]">
                    <Rightbar />
                </div>
            );
        };
        return <AutoOpen />;
    },
};
