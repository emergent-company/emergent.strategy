import type { Meta, StoryObj } from '@storybook/react';
import { Tooltip, type TooltipProps } from './index';

const meta: Meta<typeof Tooltip> = {
    title: 'Atoms/Tooltip',
    component: Tooltip,
    args: {
        placement: 'top',
        content: <span className="font-medium">Tooltip content</span>,
    },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: (args: TooltipProps) => (
        <div className="flex justify-center p-10">
            <Tooltip {...args}>
                <button className="btn-outline btn">Hover me</button>
            </Tooltip>
        </div>
    ),
};

export const Placements: Story = {
    render: () => (
        <div className="gap-8 grid grid-cols-2 p-10">
            {(['top', 'right', 'bottom', 'left'] as const).map(p => (
                <Tooltip key={p} placement={p} content={<span>{p} tooltip</span>}>
                    <button className="btn btn-sm">{p}</button>
                </Tooltip>
            ))}
        </div>
    )
};
