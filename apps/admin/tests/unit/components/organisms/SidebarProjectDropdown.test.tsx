/**
 * Tests SidebarProjectDropdown component.
 *
 * Mocked: AccessTreeContext
 * Real: Component rendering, event handlers
 * Auth: Not applicable (unit test)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { SidebarProjectDropdown } from '@/components/organisms/SidebarProjectDropdown';
import {
  AccessTreeContext,
  type AccessTreeContextValue,
  type OrgWithProjects,
} from '@/contexts/access-tree';

// Mock data
const mockTree: OrgWithProjects[] = [
  {
    id: 'org-1',
    name: 'Alpha Organization',
    role: 'owner',
    projects: [
      { id: 'proj-1', name: 'Alpha Project 1', orgId: 'org-1', role: 'admin' },
      { id: 'proj-2', name: 'Alpha Project 2', orgId: 'org-1', role: 'member' },
    ],
  },
  {
    id: 'org-2',
    name: 'Beta Organization',
    role: 'member',
    projects: [
      { id: 'proj-3', name: 'Beta Project', orgId: 'org-2', role: 'admin' },
    ],
  },
];

const mockEmptyOrgTree: OrgWithProjects[] = [
  {
    id: 'org-empty',
    name: 'Empty Organization',
    role: 'owner',
    projects: [],
  },
];

// Flatten projects for context
const flattenProjects = (tree: OrgWithProjects[]) =>
  tree.flatMap((org) => org.projects);

// Create a mock context value
const createMockContextValue = (
  overrides: Partial<AccessTreeContextValue> = {}
): AccessTreeContextValue => ({
  tree: mockTree,
  orgs: mockTree.map(({ id, name, role }) => ({ id, name, role })),
  projects: flattenProjects(mockTree),
  getOrgRole: (orgId: string) => mockTree.find((o) => o.id === orgId)?.role,
  getProjectRole: (projectId: string) =>
    flattenProjects(mockTree).find((p) => p.id === projectId)?.role,
  loading: false,
  error: undefined,
  refresh: vi.fn(),
  ...overrides,
});

// Wrapper component that provides context
const renderWithContext = (
  ui: React.ReactElement,
  contextValue: AccessTreeContextValue = createMockContextValue()
) => {
  return render(
    <AccessTreeContext.Provider value={contextValue}>
      {ui}
    </AccessTreeContext.Provider>
  );
};

describe('SidebarProjectDropdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('8.1: Renders grouped structure', () => {
    it('renders organization headers as group headings', () => {
      renderWithContext(<SidebarProjectDropdown />);

      // Organization headers should be visible (use getAllByText since org names appear multiple times)
      const alphaOrgTexts = screen.getAllByText('Alpha Organization');
      const betaOrgTexts = screen.getAllByText('Beta Organization');
      expect(alphaOrgTexts.length).toBeGreaterThan(0);
      expect(betaOrgTexts.length).toBeGreaterThan(0);
    });

    it('renders projects under their respective organizations', () => {
      renderWithContext(<SidebarProjectDropdown />);

      // Projects should be visible (use getAllByText since they may appear in trigger too)
      expect(screen.getAllByText('Alpha Project 1').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Alpha Project 2').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Beta Project').length).toBeGreaterThan(0);
    });

    it('renders organization headers with heading role', () => {
      renderWithContext(<SidebarProjectDropdown />);

      const headings = screen.getAllByRole('heading', { level: 3 });
      expect(headings).toHaveLength(2);
      expect(headings[0]).toHaveTextContent('Alpha Organization');
      expect(headings[1]).toHaveTextContent('Beta Organization');
    });
  });

  describe('8.2: Selection updates both project and org context', () => {
    it('calls onSelectProject with project and org info when project clicked', () => {
      const onSelectProject = vi.fn();
      renderWithContext(
        <SidebarProjectDropdown onSelectProject={onSelectProject} />
      );

      // Click on a project
      const projectButton = screen.getByRole('button', {
        name: /Alpha Project 1/i,
      });
      fireEvent.click(projectButton);

      // Should call with project id, name, org id, org name
      expect(onSelectProject).toHaveBeenCalledWith(
        'proj-1',
        'Alpha Project 1',
        'org-1',
        'Alpha Organization'
      );
    });

    it('calls onSelectProject with correct org when selecting project from different org', () => {
      const onSelectProject = vi.fn();
      renderWithContext(
        <SidebarProjectDropdown onSelectProject={onSelectProject} />
      );

      // Click on Beta Project
      const projectButton = screen.getByRole('button', {
        name: /Beta Project/i,
      });
      fireEvent.click(projectButton);

      expect(onSelectProject).toHaveBeenCalledWith(
        'proj-3',
        'Beta Project',
        'org-2',
        'Beta Organization'
      );
    });
  });

  describe('8.3: Empty states', () => {
    it('shows "No organizations available" when tree is empty', () => {
      const emptyContext = createMockContextValue({
        tree: [],
        orgs: [],
        projects: [],
      });
      renderWithContext(<SidebarProjectDropdown />, emptyContext);

      expect(
        screen.getByText('No organizations available')
      ).toBeInTheDocument();
    });

    it('shows "No projects in this organization" for org with no projects', () => {
      const emptyOrgContext = createMockContextValue({
        tree: mockEmptyOrgTree,
        orgs: mockEmptyOrgTree.map(({ id, name, role }) => ({
          id,
          name,
          role,
        })),
        projects: [],
      });
      renderWithContext(<SidebarProjectDropdown />, emptyOrgContext);

      expect(screen.getByText('Empty Organization')).toBeInTheDocument();
      expect(
        screen.getByText('No projects in this organization')
      ).toBeInTheDocument();
    });
  });

  describe('8.4: Loading state', () => {
    it('displays skeleton when loading from context', () => {
      const loadingContext = createMockContextValue({
        loading: true,
        tree: [],
      });
      renderWithContext(<SidebarProjectDropdown />, loadingContext);

      // Should show skeleton elements
      const skeletons = document.querySelectorAll('.skeleton');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('displays skeleton when loading prop is true', () => {
      renderWithContext(<SidebarProjectDropdown loading={true} />);

      const skeletons = document.querySelectorAll('.skeleton');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('8.5: Active project highlighted', () => {
    it('marks active project with aria-current', () => {
      renderWithContext(
        <SidebarProjectDropdown
          activeProjectId="proj-2"
          activeProjectName="Alpha Project 2"
        />
      );

      // Get all buttons with the project name, filter for the actual button element
      const allButtons = screen.getAllByRole('button', {
        name: /Alpha Project 2/i,
      });
      // The actual project item button has aria-current
      const activeButton = allButtons.find(
        (btn) => btn.tagName === 'BUTTON' && btn.getAttribute('aria-current')
      );
      expect(activeButton).toBeDefined();
      expect(activeButton).toHaveAttribute('aria-current', 'true');
    });

    it('shows checkmark icon for active project', () => {
      renderWithContext(
        <SidebarProjectDropdown
          activeProjectId="proj-2"
          activeProjectName="Alpha Project 2"
        />
      );

      // Get all buttons with the project name, filter for the actual button element with aria-current
      const allButtons = screen.getAllByRole('button', {
        name: /Alpha Project 2/i,
      });
      const activeButton = allButtons.find(
        (btn) => btn.tagName === 'BUTTON' && btn.getAttribute('aria-current')
      );
      expect(activeButton).toBeDefined();
      // Check for icon with lucide--check class
      const checkIcon = activeButton!.querySelector('[class*="lucide--check"]');
      expect(checkIcon).toBeInTheDocument();
    });

    it('does not mark inactive projects with aria-current', () => {
      renderWithContext(
        <SidebarProjectDropdown
          activeProjectId="proj-2"
          activeProjectName="Alpha Project 2"
        />
      );

      // Find the inactive project button (Alpha Project 1)
      const allButtons = screen.getAllByRole('button', {
        name: /Alpha Project 1/i,
      });
      // The actual button element should not have aria-current
      const inactiveButton = allButtons.find((btn) => btn.tagName === 'BUTTON');
      expect(inactiveButton).not.toHaveAttribute('aria-current');
    });
  });

  describe('Trigger display', () => {
    it('shows active project name in trigger', () => {
      renderWithContext(
        <SidebarProjectDropdown
          activeProjectId="proj-1"
          activeProjectName="Alpha Project 1"
        />
      );

      // The trigger should show the project name
      expect(screen.getAllByText('Alpha Project 1')[0]).toBeInTheDocument();
    });

    it('shows organization name under project name in trigger', () => {
      renderWithContext(
        <SidebarProjectDropdown
          activeProjectId="proj-1"
          activeProjectName="Alpha Project 1"
        />
      );

      // The trigger shows org name (appears multiple times - once in trigger, once in dropdown)
      const orgNames = screen.getAllByText('Alpha Organization');
      expect(orgNames.length).toBeGreaterThanOrEqual(1);
    });

    it('shows "Select project" when no project selected', () => {
      renderWithContext(<SidebarProjectDropdown />);

      expect(screen.getByText('Select project')).toBeInTheDocument();
      expect(screen.getByText('No project selected')).toBeInTheDocument();
    });
  });

  describe('Add actions', () => {
    it('renders Add Project button when onAddProject provided', () => {
      const onAddProject = vi.fn();
      renderWithContext(<SidebarProjectDropdown onAddProject={onAddProject} />);

      // Should have Add Project buttons (one per org)
      const addButtons = screen.getAllByRole('button', {
        name: /Add Project/i,
      });
      expect(addButtons).toHaveLength(2); // One for each org
    });

    it('calls onAddProject with org info when Add Project clicked', () => {
      const onAddProject = vi.fn();
      renderWithContext(<SidebarProjectDropdown onAddProject={onAddProject} />);

      const addButtons = screen.getAllByRole('button', {
        name: /Add Project/i,
      });
      fireEvent.click(addButtons[0]); // First org's Add Project button

      expect(onAddProject).toHaveBeenCalledWith('org-1', 'Alpha Organization');
    });

    it('renders Add Organization button when onAddOrganization provided', () => {
      const onAddOrganization = vi.fn();
      renderWithContext(
        <SidebarProjectDropdown onAddOrganization={onAddOrganization} />
      );

      expect(
        screen.getByRole('button', { name: /Add Organization/i })
      ).toBeInTheDocument();
    });

    it('calls onAddOrganization when Add Organization clicked', () => {
      const onAddOrganization = vi.fn();
      renderWithContext(
        <SidebarProjectDropdown onAddOrganization={onAddOrganization} />
      );

      const addOrgButton = screen.getByRole('button', {
        name: /Add Organization/i,
      });
      fireEvent.click(addOrgButton);

      expect(onAddOrganization).toHaveBeenCalled();
    });
  });

  describe('Error display', () => {
    it('displays error message when errorMsg provided', () => {
      renderWithContext(
        <SidebarProjectDropdown
          errorMsg="Failed to load projects"
          onAddOrganization={() => {}}
        />
      );

      expect(screen.getByText('Failed to load projects')).toBeInTheDocument();
    });
  });
});
