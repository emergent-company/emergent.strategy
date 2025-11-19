import type { Meta, StoryObj } from '@storybook/react';
import {
  SidebarProjectDropdown,
  type SidebarProjectDropdownProps,
} from './index';
import {
  AccessTreeContext,
  type AccessTreeContextValue,
  type OrgWithProjects,
} from '@/contexts/access-tree';
import { type ReactNode } from 'react';

// Mock AccessTreeProvider for stories
const MockAccessTreeProvider = ({
  children,
  tree = [],
  loading = false,
}: {
  children: ReactNode;
  tree?: OrgWithProjects[];
  loading?: boolean;
}) => {
  const orgs = tree.map(({ id, name, role }) => ({ id, name, role }));
  const projects = tree.flatMap((org) => org.projects);

  const value: AccessTreeContextValue = {
    tree,
    orgs,
    projects,
    getOrgRole: (orgId: string) => tree.find((o) => o.id === orgId)?.role,
    getProjectRole: (projectId: string) => {
      for (const org of tree) {
        const project = org.projects.find((p) => p.id === projectId);
        if (project) return project.role;
      }
      return undefined;
    },
    loading,
    error: undefined,
    refresh: async () => {},
  };

  return (
    <AccessTreeContext.Provider value={value}>
      {children}
    </AccessTreeContext.Provider>
  );
};

const meta: Meta<typeof SidebarProjectDropdown> = {
  title: 'Organisms/Sidebar/SidebarProjectDropdown',
  component: SidebarProjectDropdown,
  parameters: { layout: 'centered', location: '/admin/documents' },
};

export default meta;
type Story = StoryObj<typeof SidebarProjectDropdown>;

const mockTreeMultipleOrgs: OrgWithProjects[] = [
  {
    id: 'org1',
    name: 'Acme Corporation',
    role: 'admin',
    projects: [
      { id: 'p1', name: 'Website Redesign', orgId: 'org1', role: 'admin' },
      { id: 'p2', name: 'Mobile App', orgId: 'org1', role: 'member' },
      {
        id: 'p3',
        name: 'Long Project Name That Should Truncate With Ellipsis',
        orgId: 'org1',
        role: 'admin',
      },
    ],
  },
  {
    id: 'org2',
    name: 'TechStart Inc',
    role: 'member',
    projects: [
      { id: 'p4', name: 'API Gateway', orgId: 'org2', role: 'admin' },
      { id: 'p5', name: 'Data Pipeline', orgId: 'org2', role: 'member' },
    ],
  },
];

const mockTreeSingleOrg: OrgWithProjects[] = [
  {
    id: 'org1',
    name: 'Solo Ventures',
    role: 'admin',
    projects: [
      { id: 'p1', name: 'Main Project', orgId: 'org1', role: 'admin' },
      { id: 'p2', name: 'Secondary Project', orgId: 'org1', role: 'member' },
    ],
  },
];

const mockTreeEmptyOrg: OrgWithProjects[] = [
  {
    id: 'org1',
    name: 'New Organization',
    role: 'admin',
    projects: [],
  },
  {
    id: 'org2',
    name: 'Active Organization',
    role: 'member',
    projects: [
      { id: 'p1', name: 'Sample Project', orgId: 'org2', role: 'admin' },
    ],
  },
];

export const Empty: Story = {
  render: (args) => (
    <MockAccessTreeProvider tree={[]}>
      <SidebarProjectDropdown {...args} />
    </MockAccessTreeProvider>
  ),
  args: {
    activeProjectId: undefined,
  },
};

export const Loading: Story = {
  render: (args) => (
    <MockAccessTreeProvider tree={[]} loading={true}>
      <SidebarProjectDropdown {...args} loading={true} />
    </MockAccessTreeProvider>
  ),
  args: {},
};

export const MultipleOrgsWithProjects: Story = {
  render: (args) => (
    <MockAccessTreeProvider tree={mockTreeMultipleOrgs}>
      <SidebarProjectDropdown {...args} />
    </MockAccessTreeProvider>
  ),
  args: {
    activeProjectId: 'p4',
    activeProjectName: 'API Gateway',
  },
};

export const SingleOrganization: Story = {
  render: (args) => (
    <MockAccessTreeProvider tree={mockTreeSingleOrg}>
      <SidebarProjectDropdown {...args} />
    </MockAccessTreeProvider>
  ),
  args: {
    activeProjectId: 'p1',
    activeProjectName: 'Main Project',
  },
};

export const OrganizationWithNoProjects: Story = {
  render: (args) => (
    <MockAccessTreeProvider tree={mockTreeEmptyOrg}>
      <SidebarProjectDropdown {...args} />
    </MockAccessTreeProvider>
  ),
  args: {
    activeProjectId: 'p1',
    activeProjectName: 'Sample Project',
  },
};

export const LongNames: Story = {
  render: (args) => (
    <MockAccessTreeProvider tree={mockTreeMultipleOrgs}>
      <SidebarProjectDropdown {...args} />
    </MockAccessTreeProvider>
  ),
  args: {
    activeProjectId: 'p3',
    activeProjectName: 'Long Project Name That Should Truncate With Ellipsis',
  },
};

export const WithAddButtons: Story = {
  render: (args) => (
    <MockAccessTreeProvider tree={mockTreeMultipleOrgs}>
      <SidebarProjectDropdown {...args} />
    </MockAccessTreeProvider>
  ),
  args: {
    activeProjectId: 'p1',
    activeProjectName: 'Website Redesign',
    onAddOrganization: () => alert('Add Organization clicked!'),
    onAddProject: (orgId: string, orgName: string) =>
      alert(`Add Project clicked for org: ${orgName} (${orgId})`),
  },
};

export const WithAddButtonsAndError: Story = {
  render: (args) => (
    <MockAccessTreeProvider tree={mockTreeSingleOrg}>
      <SidebarProjectDropdown {...args} />
    </MockAccessTreeProvider>
  ),
  args: {
    activeProjectId: 'p1',
    activeProjectName: 'Main Project',
    onAddOrganization: () => alert('Add Organization clicked!'),
    onAddProject: (orgId: string, orgName: string) =>
      alert(`Add Project clicked for org: ${orgName} (${orgId})`),
    errorMsg: 'Failed to load projects',
  },
};
