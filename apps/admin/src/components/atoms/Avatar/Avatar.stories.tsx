import type { Meta, StoryObj } from '@storybook/react';
import { Avatar, AvatarProps } from './Avatar';

const meta: Meta<AvatarProps> = {
  title: 'Atoms/Avatar',
  component: Avatar,
  args: {
    name: 'John Doe',
    size: 'sm',
    shape: 'circle',
    radius: 'box',
  },
  argTypes: {
    size: { control: 'select', options: ['xs', 'sm', 'md', 'lg'] },
    shape: { control: 'select', options: ['circle', 'square'] },
    radius: {
      control: 'select',
      options: [
        'none',
        'sm',
        'md',
        'lg',
        'xl',
        'full',
        'box',
        'field',
        'selector',
      ],
    },
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
      ],
    },
  },
};
export default meta;
type Story = StoryObj<AvatarProps>;

export const WithName: Story = {
  args: { name: 'John Doe' },
};

export const WithEmail: Story = {
  args: { name: 'john.doe@example.com' },
};

export const SingleName: Story = {
  args: { name: 'Alice' },
};

export const Letters: Story = {
  args: { letters: 'HH', color: 'primary', name: undefined },
};

export const Image: Story = {
  args: {
    src: 'http://localhost:3845/assets/ad7ffc0978017ac3f6f3520a8ccecf5d5b562b2e.png',
    name: undefined,
  },
};

export const WithBorder: Story = {
  args: { border: true, borderColor: 'primary' },
};

export const LargeSquare: Story = {
  args: { size: 'lg', shape: 'square', radius: 'xl' },
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex items-end gap-4">
      <Avatar name="John Doe" size="xs" />
      <Avatar name="John Doe" size="sm" />
      <Avatar name="John Doe" size="md" />
      <Avatar name="John Doe" size="lg" />
    </div>
  ),
};

export const DeterministicColors: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Avatar name="Alice Smith" size="md" />
      <Avatar name="Bob Johnson" size="md" />
      <Avatar name="Charlie Brown" size="md" />
      <Avatar name="Diana Prince" size="md" />
      <Avatar name="Eve Wilson" size="md" />
      <Avatar name="Frank Miller" size="md" />
      <Avatar name="Grace Lee" size="md" />
      <Avatar name="Henry Ford" size="md" />
    </div>
  ),
};

export const CustomRadiusNumber: Story = {
  args: { size: 'sm', shape: 'square', radius: 12 },
};
