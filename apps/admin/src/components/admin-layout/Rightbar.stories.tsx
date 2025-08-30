import type { Meta, StoryObj } from "@storybook/react";
import { useEffect } from "react";

import { Rightbar } from "./Rightbar";

const meta: Meta<typeof Rightbar> = {
    title: "Admin Layout/Rightbar",
    component: Rightbar,
};

export default meta;
type Story = StoryObj<typeof Rightbar>;

export const Default: Story = {
    render: () => {
        const Wrapper = () => {
            // Open the drawer by checking its toggle input once mounted
            useEffect(() => {
                const el = document.getElementById("layout-rightbar-drawer") as HTMLInputElement | null;
                if (el && !el.checked) el.checked = true;
            }, []);
            return (
                <div className="h-[480px]">
                    {/* An outer section is helpful only to give some height in Storybook */}
                    <Rightbar />
                </div>
            );
        };
        return <Wrapper />;
    },
};
