import type { Meta, StoryObj } from '@storybook/react'
import React, { useState } from 'react'
import { ConfirmActionModal } from './ConfirmActionModal'

const meta: Meta<typeof ConfirmActionModal> = {
    title: 'Organisms/ConfirmActionModal',
    component: ConfirmActionModal,
    parameters: { layout: 'centered' },
    argTypes: {
        title: { control: 'text' },
        description: { control: 'text' },
        sizeClassName: { control: 'text' },
        confirmVariant: {
            control: 'select',
            options: ['primary', 'secondary', 'accent', 'info', 'success', 'warning', 'error', 'outline']
        },
        confirmDisabled: { control: 'boolean' },
        confirmLoading: { control: 'boolean' }
    }
}
export default meta

type Story = StoryObj<typeof ConfirmActionModal>

const Demo: React.FC<Partial<React.ComponentProps<typeof ConfirmActionModal>>> = (props) => {
    const [open, setOpen] = useState(false)
    return (
        <div className='space-y-4'>
            <button className='btn btn-primary' onClick={() => setOpen(true)}>Open Confirm Modal</button>
            <ConfirmActionModal
                open={open}
                onCancel={() => setOpen(false)}
                onConfirm={() => {
                    console.log('Confirmed!')
                    setOpen(false)
                }}
                title={props.title ?? 'Delete Project'}
                description={props.description ?? 'This action cannot be undone. All related data will be permanently removed.'}
                confirmVariant={props.confirmVariant ?? 'error'}
                confirmLabel={props.confirmLabel}
                cancelLabel={props.cancelLabel}
                confirmDisabled={props.confirmDisabled}
                confirmLoading={props.confirmLoading}
                sizeClassName={props.sizeClassName ?? 'max-w-md'}
            >
                {props.children ?? (
                    <p className='text-sm'>Please review any dependencies before proceeding.</p>
                )}
            </ConfirmActionModal>
        </div>
    )
}

export const Default: Story = { render: (args) => <Demo {...args} /> }

export const LoadingState: Story = {
    args: { confirmLoading: true, confirmVariant: 'error', title: 'Deleting…' },
    render: (args) => <Demo {...args} />
}

export const AlternateVariant: Story = {
    args: { confirmVariant: 'warning', title: 'Archive Project', description: 'You can restore archived projects later.' },
    render: (args) => <Demo {...args} />
}
