import type { Meta, StoryObj } from "@storybook/react";
import { Footer } from "./Footer";

const meta: Meta<typeof Footer> = {
    title: "AdminLayout/Footer",
    component: Footer,
    parameters: {
        docs: {
            description: { component: `Persistent bottom bar showing copyright / links. Layout shell composes it conditionally. This story renders standalone for styling reference.` },
        },
    },
    tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof Footer>;

export const Default: Story = {
    render: () => <Footer />,
};
