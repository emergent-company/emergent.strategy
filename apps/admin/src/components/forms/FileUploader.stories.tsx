import type { Meta, StoryObj } from "@storybook/react";
import { FileUploader } from "./FileUploader";
const meta: Meta<typeof FileUploader> = {
    title: "Forms/FileUploader",
    component: FileUploader,
    parameters: {
        docs: {
            description: {
                component: `Thin wrapper around FilePond (or native input) to provide consistent styling + multiple file support. Use \`allowMultiple\` and supply \`labelIdle\` with inline HTML for action text. Emits native change events.`,
            },
        },
    },
    tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        credits: false,
        allowMultiple: true,
        labelIdle: 'Drag & Drop your files or <span class="filepond--label-action">Browse</span>',
    },
};
