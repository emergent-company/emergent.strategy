import type { Meta, StoryObj } from '@storybook/react';
import { Logo, type LogoProps } from './index';

const meta: Meta<typeof Logo> = {
    title: 'Atoms/Logo',
    component: Logo,
    parameters: { layout: 'centered' },
    args: { className: 'h-8' } satisfies Partial<LogoProps>,
};
export default meta;

type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Small: Story = { args: { className: 'h-6' } };
export const Large: Story = { args: { className: 'h-12' } };
