import type { Meta, StoryObj } from '@storybook/react';
import { Sidebar } from './index';
import { SidebarSection } from '@/components/organisms/SidebarSection';
import { SidebarMenuItem } from '@/components/molecules/SidebarMenuItem';
import { SidebarProjectDropdown } from '@/components/organisms/SidebarProjectDropdown';
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
}: {
  children: ReactNode;
  tree?: OrgWithProjects[];
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
    loading: false,
    error: undefined,
    refresh: async () => {},
  };

  return (
    <AccessTreeContext.Provider value={value}>
      {children}
    </AccessTreeContext.Provider>
  );
};

const mockTree: OrgWithProjects[] = [
  {
    id: 'org1',
    name: 'Primary Organization',
    role: 'admin',
    projects: [
      { id: 'p-1', name: 'Core API', orgId: 'org1', role: 'admin' },
      { id: 'p-2', name: 'Indexer', orgId: 'org1', role: 'member' },
    ],
  },
];

const meta: Meta<typeof Sidebar> = {
  title: 'Organisms/Sidebar/CompleteExample',
  component: Sidebar,
  // Global MemoryRouter supplied in .storybook/preview.tsx – avoid nesting routers.
  decorators: [
    (Story) => (
      <MockAccessTreeProvider tree={mockTree}>
        <div className="border border-base-300 rounded-box w-72 h-[600px] overflow-hidden">
          <Story />
        </div>
      </MockAccessTreeProvider>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'Composed Sidebar organism using atomic-layer sections, menu items, and project dropdown.',
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof Sidebar>;

export const Default: Story = {
  render: () => (
    <Sidebar>
      <SidebarProjectDropdown
        activeProjectId="p-1"
        activeProjectName="Core API"
        onSelectProject={() => {
          // Signature: (projectId, projectName, orgId, orgName) => void
        }}
      />
      <SidebarSection title="General">
        <SidebarMenuItem
          id="documents"
          url="/admin/documents"
          icon="lucide--file-text"
        >
          Documents
        </SidebarMenuItem>
        <SidebarMenuItem
          id="settings"
          url="/admin/settings"
          icon="lucide--settings"
        >
          Settings
        </SidebarMenuItem>
      </SidebarSection>
      <SidebarSection title="Collapsible">
        <SidebarMenuItem id="parent" icon="lucide--folder" collapsible>
          Parent
          <SidebarMenuItem id="child-a" url="/admin/a">
            Child A
          </SidebarMenuItem>
          <SidebarMenuItem id="child-b" url="/admin/b">
            Child B
          </SidebarMenuItem>
        </SidebarMenuItem>
      </SidebarSection>
    </Sidebar>
  ),
};
