import type { Meta, StoryObj } from "@storybook/react";
import { RightbarDirectionSelector } from "../layout/RightbarDirectionSelector";

const meta: Meta<typeof RightbarDirectionSelector> = {
    title: "Layout/Rightbar/DirectionSelector",
    component: RightbarDirectionSelector,
    parameters: {
        docs: {
            description: {
                component: `LTR / RTL toggle. Adjusts dir attribute and cascades layout flipping where components use logical properties.`,
            },
        },
    },
    tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof RightbarDirectionSelector>;

export const Default: Story = {
    render: () => (
        <div className="max-w-xl">
            <RightbarDirectionSelector />
        </div>
    ),
};
