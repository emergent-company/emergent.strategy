import type { Meta, StoryObj } from '@storybook/react';
import { Spinner, type SpinnerSize, type SpinnerVariant } from './Spinner';

const meta: Meta<typeof Spinner> = {
  title: 'Atoms/Spinner',
  component: Spinner,
  parameters: {
    docs: {
      description: {
        component:
          'Loading spinner component. Replaces raw `<span className="loading loading-spinner loading-{size}">` patterns across the codebase.',
      },
      source: { state: 'open' },
    },
  },
  args: {
    size: 'md',
    variant: 'spinner',
  },
  argTypes: {
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg'] satisfies SpinnerSize[],
    },
    variant: {
      control: 'select',
      options: [
        'spinner',
        'dots',
        'ring',
        'ball',
        'bars',
        'infinity',
      ] satisfies SpinnerVariant[],
    },
  },
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      {(['xs', 'sm', 'md', 'lg'] as const).map((size) => (
        <div key={size} className="flex flex-col items-center gap-2">
          <Spinner size={size} />
          <span className="text-xs text-base-content/60">{size}</span>
        </div>
      ))}
    </div>
  ),
};

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      {(['spinner', 'dots', 'ring', 'ball', 'bars', 'infinity'] as const).map(
        (variant) => (
          <div key={variant} className="flex flex-col items-center gap-2">
            <Spinner variant={variant} size="lg" />
            <span className="text-xs text-base-content/60">{variant}</span>
          </div>
        )
      )}
    </div>
  ),
};

export const WithColors: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <Spinner size="lg" className="text-primary" />
      <Spinner size="lg" className="text-secondary" />
      <Spinner size="lg" className="text-accent" />
      <Spinner size="lg" className="text-info" />
      <Spinner size="lg" className="text-success" />
      <Spinner size="lg" className="text-warning" />
      <Spinner size="lg" className="text-error" />
    </div>
  ),
};

export const InButton: Story = {
  render: () => (
    <button className="btn btn-primary" disabled>
      <Spinner size="sm" />
      Loading...
    </button>
  ),
};
