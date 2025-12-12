import type { Meta, StoryObj } from '@storybook/react';
import { SystemStatusDropdown } from './SystemStatusDropdown';

const meta: Meta<typeof SystemStatusDropdown> = {
  title: 'Molecules/SystemStatusDropdown',
  component: SystemStatusDropdown,
  parameters: {
    docs: {
      description: {
        component:
          'A dropdown component that displays system health status including real-time SSE connection, backend API health, and database status.',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="h-[350px] flex flex-col justify-end items-start p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SystemStatusDropdown>;

export const Default: Story = {
  render: () => <SystemStatusDropdown />,
};

export const WithCustomClass: Story = {
  render: () => <SystemStatusDropdown className="scale-110" />,
};
