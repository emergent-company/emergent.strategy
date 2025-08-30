import type { Meta, StoryObj } from "@storybook/react";
import { FileUploader } from "./FileUploader";

const meta: Meta<typeof FileUploader> = {
    title: "Forms/FileUploader",
    component: FileUploader,
};

export default meta;
type Story = StoryObj<typeof FileUploader>;

export const Default: Story = {
    args: {
        credits: false,
        allowMultiple: true,
        labelIdle: 'Drag & Drop your files or <span class="filepond--label-action">Browse</span>',
    },
};
