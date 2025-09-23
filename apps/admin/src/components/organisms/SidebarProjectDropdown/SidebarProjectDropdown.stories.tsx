import type { Meta, StoryObj } from '@storybook/react';
import { SidebarProjectDropdown, type SidebarProjectDropdownProps } from './index';

const meta: Meta<typeof SidebarProjectDropdown> = {
    title: 'Organisms/Sidebar/SidebarProjectDropdown',
    component: SidebarProjectDropdown,
    parameters: { layout: 'centered', location: '/admin/documents' },
};

export default meta;
type Story = StoryObj<typeof SidebarProjectDropdown>;

const sampleProjects: NonNullable<SidebarProjectDropdownProps['projects']> = [
    { id: 'p1', name: 'Alpha' },
    { id: 'p2', name: 'Beta Release' },
    { id: 'p3', name: 'Gamma Long Named Project For Truncation Test' },
];

export const Empty: Story = { args: { projects: [], activeProjectId: undefined } };

export const Loading: Story = { args: { loading: true } };

export const WithProjects: Story = {
    args: {
        projects: sampleProjects,
        activeProjectId: 'p2',
        activeProjectName: 'Beta Release',
    },
};

export const ErrorState: Story = {
    args: {
        projects: sampleProjects,
        errorMsg: 'Failed to fetch projects',
    },
};
