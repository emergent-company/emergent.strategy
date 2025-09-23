import type { Meta, StoryObj } from '@storybook/react';
import { ProjectGate } from './';

const meta: Meta<typeof ProjectGate> = {
    title: 'Gates/ProjectGate',
    component: ProjectGate,
    parameters: {
        docs: {
            description: {
                component: 'Ensures a project exists and is selected before rendering its children. Shows create/select flows or passes children through.'
            }
        }
    },
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Loading: Story = {
    parameters: {
        docs: { description: { story: 'Simulated via story mocks (implement provider stubs if needed).' } }
    },
};

export const CreateFirst: Story = {};

export const SelectExisting: Story = {};

export const PassThrough: Story = { args: { children: 'Rendered child content once project is selected.' } };
