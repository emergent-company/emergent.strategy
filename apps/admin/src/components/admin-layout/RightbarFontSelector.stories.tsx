import type { Meta, StoryObj } from "@storybook/react";
import { RightbarFontSelector } from "./RightbarFontSelector";

const meta: Meta<typeof RightbarFontSelector> = {
    title: "AdminLayout/Rightbar/FontSelector",
    component: RightbarFontSelector,
    parameters: {
        docs: {
            description: {
                component: `Font family picker. Updates data-font-family attribute on <html> via config context so typography classes respond instantly.`,
            },
        },
    },
    tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof RightbarFontSelector>;

export const Default: Story = {
    render: () => (
        <div className="max-w-xl">
            <RightbarFontSelector />
        </div>
    ),
};
