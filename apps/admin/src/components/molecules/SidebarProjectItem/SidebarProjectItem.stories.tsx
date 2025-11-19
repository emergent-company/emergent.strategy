import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { SidebarProjectItem, SidebarProjectItemProps } from './index';

const meta: Meta<typeof SidebarProjectItem> = {
  title: 'Molecules/Sidebar/SidebarProjectItem',
  component: SidebarProjectItem,
  decorators: [
    (Story) => (
      <div className="bg-base-200 p-4 rounded-box w-64">
        <Story />
      </div>
    ),
  ],
  args: {
    project: { id: 'proj-1', name: 'Acme Project', status: 'Active' },
    orgName: 'Acme Corporation',
    active: false,
  } satisfies Partial<SidebarProjectItemProps>,
  parameters: {
    docs: {
      description: {
        component: 'Single project row used inside project dropdown listing.',
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof SidebarProjectItem>;

export const Default: Story = {};

export const Active: Story = { args: { active: true } };

export const LongName: Story = {
  args: {
    project: {
      id: 'proj-long',
      name: 'Very Long Project Name That Should Truncate Gracefully In The Sidebar UI Shell',
      status: 'Provisioning',
    },
    orgName: 'Enterprise Organization With Long Name',
  },
};

export const MissingOrgName: Story = {
  args: {
    project: {
      id: 'proj-no-org',
      name: 'Project Without Org',
      status: 'Active',
    },
    orgName: undefined,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Project item without organization name displays only the project name.',
      },
    },
  },
};
