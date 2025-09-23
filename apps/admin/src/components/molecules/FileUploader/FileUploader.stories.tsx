import type { Meta, StoryObj } from '@storybook/react'
import { FileUploader } from './index'

const meta: Meta<typeof FileUploader> = {
    title: 'Molecules/FileUploader',
    component: FileUploader,
    parameters: {
        docs: {
            description: {
                component:
                    'Thin wrapper around FilePond providing consistent defaults (no credits, optional multiple). Extend here for validation / localization later.',
            },
        },
    },
    tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
    args: {
        credits: false,
        allowMultiple: true,
        labelIdle: 'Drag & Drop your files or <span class="filepond--label-action">Browse</span>',
    },
}
