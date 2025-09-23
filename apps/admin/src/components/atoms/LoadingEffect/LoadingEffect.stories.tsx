import type { Meta, StoryObj } from '@storybook/react';
import { LoadingEffect, type LoadingEffectProps } from './index';

const meta: Meta<typeof LoadingEffect> = {
    title: 'Atoms/LoadingEffect',
    component: LoadingEffect,
    parameters: { layout: 'centered' },
    args: { width: 200, height: 24, className: 'rounded-md' } satisfies Partial<LoadingEffectProps>,
    argTypes: {
        width: { control: { type: 'number' } },
        height: { control: { type: 'number' } },
        className: { control: 'text' },
    },
};
export default meta;

type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Large: Story = { args: { width: 320, height: 48 } };
