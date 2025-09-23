import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { Topbar, TopbarProps } from './index'

const meta: Meta<typeof Topbar> = {
    title: 'Organisms/Topbar',
    component: Topbar,
    args: {},
    parameters: {
        layout: 'fullscreen',
        docs: {
            description: {
                component:
                    'Topbar organism providing primary horizontal navigation shell; composes toggle, search, notifications, profile, and theme switch.'
            }
        }
    }
}
export default meta

type Story = StoryObj<typeof Topbar>

export const Default: Story = {
    render: (args: TopbarProps) => (
        <div className="bg-base-100 border border-base-300">
            <Topbar {...args} />
        </div>
    )
}

export const WithCustomClass: Story = {
    args: { className: 'bg-base-200' },
    render: (args: TopbarProps) => (
        <div className="bg-base-100 border border-base-300">
            <Topbar {...args} />
        </div>
    )
}
