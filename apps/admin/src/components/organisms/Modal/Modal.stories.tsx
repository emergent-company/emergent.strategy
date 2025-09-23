import type { Meta, StoryObj } from '@storybook/react'
import React, { useState } from 'react'
import { Modal, ModalProps } from './Modal'

const meta: Meta<typeof Modal> = {
    title: 'Organisms/Modal',
    component: Modal,
    parameters: {
        layout: 'centered'
        // NOTE: removed global docs.source.code override so stories reflect live args.
    },
    argTypes: {
        title: { control: 'text', description: 'Modal heading text' },
        description: { control: 'text', description: 'Supporting description text' },
        sizeClassName: { control: 'text', description: 'Tailwind width utilities appended to modal-box' },
        hideCloseButton: { control: 'boolean', description: 'Hide the built‑in close (X) button' }
    }
}
export default meta

type Story = StoryObj<typeof Modal>

const DemoWrapper: React.FC<Partial<ModalProps>> = (props) => {
    const [open, setOpen] = useState(false)
    return (
        <div className='space-y-4'>
            <button className='btn btn-primary' onClick={() => setOpen(true)}>
                Open Modal
            </button>
            <Modal
                open={open}
                onOpenChange={(o) => setOpen(o)}
                title={props.title ?? 'Example Modal'}
                description={props.description ?? 'This is a reusable modal component built with daisyUI + React.'}
                actions={
                    props.actions ?? [
                        { label: 'Cancel', variant: 'ghost', onClick: () => setOpen(false) },
                        { label: 'Confirm', variant: 'primary', autoFocus: true, onClick: () => setOpen(false) }
                    ]
                }
            >
                <p>You can put any React nodes here. It supports a controlled open state and accessible structure.</p>
            </Modal>
        </div>
    )
}

export const Default: Story = {
    args: {
        title: 'Example Modal',
        description: 'This is a reusable modal component built with daisyUI + React.'
    },
    render: (args) => <DemoWrapper {...args} />
}

// PlainUsage is a non-interactive code-focused variant (still renders, but mirrors docs snippet)
export const PlainUsage: Story = {
    name: 'Plain Usage (code snippet)',
    parameters: {
        docs: {
            source: {
                code: `import { useState } from 'react';\nimport { Modal } from '@/components';\n\nexport function ExampleModalUsage() {\n  const [open, setOpen] = useState(false);\n  return (\n    <div className='space-y-4'>\n      <button className='btn btn-primary' onClick={() => setOpen(true)}>Open Modal</button>\n      <Modal\n        open={open}\n        onOpenChange={(o) => setOpen(o)}\n        title='Example Modal'\n        description='This is a reusable modal component built with daisyUI + React.'\n        actions={[\n          { label: 'Cancel', variant: 'ghost', onClick: () => setOpen(false) },\n          { label: 'Confirm', variant: 'primary', autoFocus: true, onClick: () => setOpen(false) }\n        ]}\n      >\n        <p>You can put any React nodes here. It supports a controlled open state and accessible structure.</p>\n      </Modal>\n    </div>\n  );\n}`
            }
        }
    },
    render: () => {
        const PlainUsageExample: React.FC = () => {
            const [open, setOpen] = useState(false)
            return (
                <div className='space-y-4'>
                    <button className='btn btn-primary' onClick={() => setOpen(true)}>
                        Open Modal
                    </button>
                    <Modal
                        open={open}
                        onOpenChange={(o) => setOpen(o)}
                        title='Example Modal'
                        description='This is a reusable modal component built with daisyUI + React.'
                        actions={[
                            { label: 'Cancel', variant: 'ghost', onClick: () => setOpen(false) },
                            { label: 'Confirm', variant: 'primary', autoFocus: true, onClick: () => setOpen(false) }
                        ]}
                    >
                        <p>You can put any React nodes here. It supports a controlled open state and accessible structure.</p>
                    </Modal>
                </div>
            )
        }
        return <PlainUsageExample />
    }
}

export const WithLongContent: Story = {
    render: () => (
        <DemoWrapper>
            <div className='space-y-2 pr-1 max-h-[40vh] overflow-y-auto'>
                {Array.from({ length: 20 }).map((_, i) => (
                    <p key={i} className='text-sm'>
                        Line {i + 1}: Lorem ipsum dolor sit amet, consectetur adipisicing elit. Aspernatur dolor quia illum exercitationem.
                    </p>
                ))}
            </div>
        </DemoWrapper>
    )
}

export const CustomSizing: Story = {
    render: () => <DemoWrapper sizeClassName='max-w-3xl' title='Wide Modal' />
}

// Interactive playground using args supplied via Storybook controls.
export const Playground: Story = {
    args: {
        title: 'Playground Modal',
        description: 'Adjust props via controls to experiment.',
        sizeClassName: 'max-w-lg',
        hideCloseButton: false
    },
    parameters: {
        docs: { source: { type: 'dynamic' } }
    },
    render: (args) => {
        const Template: React.FC = () => {
            const [open, setOpen] = useState(false)
            return (
                <div className='space-y-4'>
                    <button className='btn btn-primary' onClick={() => setOpen(true)}>Open Modal</button>
                    <Modal
                        open={open}
                        onOpenChange={(o) => setOpen(o)}
                        title={args.title}
                        description={args.description}
                        sizeClassName={args.sizeClassName}
                        hideCloseButton={args.hideCloseButton}
                        actions={[
                            { label: 'Cancel', variant: 'ghost', onClick: () => setOpen(false) },
                            { label: 'Confirm', variant: 'primary', autoFocus: true, onClick: () => setOpen(false) }
                        ]}
                    >
                        <p className='text-sm'>Use the Storybook Controls panel to modify props in real time.</p>
                    </Modal>
                </div>
            )
        }
        return <Template />
    }
}
