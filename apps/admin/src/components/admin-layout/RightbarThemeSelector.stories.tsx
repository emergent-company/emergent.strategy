import type { Meta, StoryObj } from "@storybook/react";
import { RightbarThemeSelector } from "./RightbarThemeSelector";

const meta: Meta<typeof RightbarThemeSelector> = {
    title: "AdminLayout/Rightbar/ThemeSelector",
    component: RightbarThemeSelector,
    parameters: {
        docs: {
            description: {
                component: `Global theme chooser listing enabled daisyUI themes. Updates \`data-theme\` attribute on <html> via config context ensuring persistence + live preview.`,
            },
        },
    },
    tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof RightbarThemeSelector>;

export const Default: Story = {
    render: () => (
        <div className="max-w-xl">
            <RightbarThemeSelector />
        </div>
    ),
};
