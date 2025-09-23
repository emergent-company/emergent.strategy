import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { Footer, FooterProps } from './index'

const meta: Meta<typeof Footer> = {
    title: 'Organisms/Footer',
    component: Footer,
    args: {},
    parameters: {
        docs: {
            description: {
                component: 'Footer organism presenting global system status and copyright.'
            }
        }
    }
}
export default meta

type Story = StoryObj<typeof Footer>

export const Default: Story = {
    render: (args: FooterProps) => (
        <div className="border border-base-300">
            <Footer {...args} />
        </div>
    )
}

export const CustomStatus: Story = {
    args: { statusMessage: 'Background jobs: 5 queued' }
}

export const CustomYear: Story = {
    args: { yearOverride: 2030 }
}
