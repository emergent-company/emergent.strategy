import type { Meta, StoryObj } from '@storybook/react'
import { Button } from './Button'
import { action } from '@/stories'
const meta: Meta<typeof Button> = {
    title: 'UI/Button',
    component: Button,
    parameters: {
        docs: {
            description: {
                component: `Usage example:\n\n\`\`\`tsx\nimport { Button } from '@/components/ui/Button'\n\nexport function Example() {\n  return <Button color='primary' onClick={() => {/* ... */}}>Save</Button>\n}\n\`\`\``,
            },
            source: { state: 'open' },
        },
    },
    args: {
        children: 'Click me',
        onClick: action('click'),
        color: 'primary',
    },
    argTypes: {
        color: {
            control: 'select',
            options: [
                'neutral',
                'primary',
                'secondary',
                'accent',
                'info',
                'success',
                'warning',
                'error',
                'ghost',
            ],
        },
        variant: {
            control: 'select',
            options: ['solid', 'outline', 'dash', 'soft', 'link'],
        },
        size: {
            control: 'select',
            options: ['xs', 'sm', 'md', 'lg', 'xl'],
        },
        shape: { control: 'select', options: ['circle', 'square', undefined] },
    },
    tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof meta>

export const Primary: Story = {}

export const Loading: Story = {
    args: { loading: true },
}

export const WithIcons: Story = {
    args: {
        startIcon: <span className="lucide--arrow-right iconify" />,
        endIcon: <span className="iconify lucide--check" />,
    },
}

export const Variants: Story = {
    render: (args) => (
        <div className="flex flex-wrap gap-3">
            {(['solid', 'outline', 'dash', 'soft', 'link'] as const).map((variant) => (
                <Button key={variant} {...args} variant={variant}>
                    {variant}
                </Button>
            ))}
        </div>
    ),
}

export const Sizes: Story = {
    render: (args) => (
        <div className="flex flex-wrap items-end gap-3">
            {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((size) => (
                <Button key={size} {...args} size={size}>
                    {size}
                </Button>
            ))}
        </div>
    ),
}

export const Colors: Story = {
    render: (args) => (
        <div className="flex flex-wrap gap-3">
            {([
                'neutral',
                'primary',
                'secondary',
                'accent',
                'info',
                'success',
                'warning',
                'error',
                'ghost',
            ] as const).map((color) => (
                <Button key={color} {...args} color={color}>
                    {color}
                </Button>
            ))}
        </div>
    ),
}

export const FullWidth: Story = {
    args: { fullWidth: true },
    parameters: { layout: 'fullscreen' },
}

export const Shapes: Story = {
    render: (args) => (
        <div className="flex flex-wrap gap-3">
            <Button {...args} shape="circle">
                <span className="iconify lucide--star" />
            </Button>
            <Button {...args} shape="square">
                <span className="iconify lucide--heart" />
            </Button>
        </div>
    ),
}
