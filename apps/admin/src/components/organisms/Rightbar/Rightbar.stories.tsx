import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { Rightbar, RightbarProps } from './index'

const meta: Meta<typeof Rightbar> = {
    title: 'Organisms/Rightbar',
    component: Rightbar,
    parameters: {
        docs: {
            description: {
                component: 'Rightbar organism exposing customization controls (theme, font, direction, sidebar theme, fullscreen/reset).'
            }
        }
    }
}
export default meta

type Story = StoryObj<typeof Rightbar>

export const Default: Story = {
    render: (args: RightbarProps) => (
        <div className="relative border border-base-300 h-[420px]">
            <Rightbar {...args} />
            <label htmlFor="layout-rightbar-drawer" className="m-4 btn btn-primary">Open Rightbar</label>
        </div>
    )
}

export const WithCustomClass: Story = {
    args: { className: 'bg-base-200' },
    render: (args: RightbarProps) => (
        <div className="relative border border-base-300 h-[420px]">
            <Rightbar {...args} />
            <label htmlFor="layout-rightbar-drawer" className="m-4 btn btn-primary">Open Rightbar</label>
        </div>
    )
}
