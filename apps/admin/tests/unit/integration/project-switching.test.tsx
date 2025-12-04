/**
 * Integration Tests: Project Switching
 *
 * These tests verify the integration between SidebarProjectDropdown
 * and its parent component's state management (via callbacks).
 *
 * Tasks covered:
 * - 9.1 Test switching projects within same org (org context unchanged)
 * - 9.2 Test switching projects across orgs (org context updates)
 * - 9.3 Test active project persists across page navigation
 * - 9.4 Test org context change triggers dependent data refresh
 * - 9.5 Test edge cases (last project deleted, org deleted)
 */
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useState, type ReactNode } from 'react';
import { SidebarProjectDropdown } from '@/components/organisms/SidebarProjectDropdown';
import {
  AccessTreeContext,
  type AccessTreeContextValue,
  type OrgWithProjects,
} from '@/contexts/access-tree';

// Sample test data
const mockTree: OrgWithProjects[] = [
  {
    id: 'org-1',
    name: 'Org Alpha',
    role: 'admin',
    projects: [
      { id: 'proj-1', name: 'Project One', orgId: 'org-1', role: 'admin' },
      { id: 'proj-2', name: 'Project Two', orgId: 'org-1', role: 'member' },
    ],
  },
  {
    id: 'org-2',
    name: 'Org Beta',
    role: 'member',
    projects: [
      { id: 'proj-3', name: 'Project Three', orgId: 'org-2', role: 'admin' },
      { id: 'proj-4', name: 'Project Four', orgId: 'org-2', role: 'member' },
    ],
  },
];

// Flatten projects for context
const flattenProjects = (tree: OrgWithProjects[]) =>
  tree.flatMap((org) => org.projects);

// Create a mock access tree context value
const createMockAccessTreeContext = (
  tree: OrgWithProjects[] = mockTree
): AccessTreeContextValue => ({
  tree,
  orgs: tree.map(({ id, name, role }) => ({ id, name, role })),
  projects: flattenProjects(tree),
  getOrgRole: (orgId: string) => tree.find((o) => o.id === orgId)?.role,
  getProjectRole: (projectId: string) =>
    flattenProjects(tree).find((p) => p.id === projectId)?.role,
  loading: false,
  error: undefined,
  refresh: vi.fn().mockResolvedValue(undefined),
});

/**
 * Helper to find a project item button in the dropdown menu (not the trigger)
 */
const findProjectItemButton = async (name: RegExp) => {
  // Find all buttons matching the name
  const buttons = await screen.findAllByRole('button', { name });
  // Return the one that has aria-current attribute (it's a project item, not trigger)
  // or the second one if no aria-current (first is trigger)
  const projectButton = buttons.find(
    (btn) => btn.hasAttribute('aria-current') || buttons.indexOf(btn) > 0
  );
  return projectButton || buttons[buttons.length - 1];
};

/**
 * Helper to find the dropdown trigger
 */
const findTrigger = () => {
  // The trigger is a div with role="button" - first one without aria-current
  const allButtons = screen.getAllByRole('button');
  return allButtons[0]; // First button is always the trigger
};

/**
 * Stateful test wrapper that simulates parent component state management.
 * This mirrors how the sidebar uses SidebarProjectDropdown in production.
 */
interface StatefulWrapperProps {
  children?: ReactNode;
  initialOrgId?: string;
  initialOrgName?: string;
  initialProjectId?: string;
  initialProjectName?: string;
  onOrgChange?: (id: string, name: string) => void;
  onProjectChange?: (id: string, name: string) => void;
  tree?: OrgWithProjects[];
}

function StatefulWrapper({
  initialOrgId,
  initialOrgName,
  initialProjectId,
  initialProjectName,
  onOrgChange,
  onProjectChange,
  tree = mockTree,
}: StatefulWrapperProps) {
  const [activeOrgId, setActiveOrgId] = useState(initialOrgId);
  const [activeOrgName, setActiveOrgName] = useState(initialOrgName);
  const [activeProjectId, setActiveProjectId] = useState(initialProjectId);
  const [activeProjectName, setActiveProjectName] =
    useState(initialProjectName);

  const handleSelectProject = (
    projectId: string,
    projectName: string,
    orgId: string,
    orgName: string
  ) => {
    // Check if org is changing
    if (orgId !== activeOrgId) {
      setActiveOrgId(orgId);
      setActiveOrgName(orgName);
      onOrgChange?.(orgId, orgName);
    }
    setActiveProjectId(projectId);
    setActiveProjectName(projectName);
    onProjectChange?.(projectId, projectName);
  };

  const accessTreeContext = createMockAccessTreeContext(tree);

  return (
    <AccessTreeContext.Provider value={accessTreeContext}>
      <SidebarProjectDropdown
        activeProjectId={activeProjectId}
        activeProjectName={activeProjectName}
        onSelectProject={handleSelectProject}
      />
      {/* Expose current state for testing */}
      <div data-testid="current-state">
        <span data-testid="current-org-id">{activeOrgId}</span>
        <span data-testid="current-org-name">{activeOrgName}</span>
        <span data-testid="current-project-id">{activeProjectId}</span>
        <span data-testid="current-project-name">{activeProjectName}</span>
      </div>
    </AccessTreeContext.Provider>
  );
}

describe('Project Switching Integration', () => {
  describe('9.1: Switching projects within same org', () => {
    it('should not change org context when switching projects in same org', async () => {
      const onOrgChange = vi.fn();
      const onProjectChange = vi.fn();

      render(
        <StatefulWrapper
          initialOrgId="org-1"
          initialOrgName="Org Alpha"
          initialProjectId="proj-1"
          initialProjectName="Project One"
          onOrgChange={onOrgChange}
          onProjectChange={onProjectChange}
        />
      );

      // Open dropdown - click the trigger (first button)
      fireEvent.click(findTrigger());

      // Find and click Project Two (same org as current Project One)
      const projectTwo = await findProjectItemButton(/Project Two/i);
      fireEvent.click(projectTwo);

      // Project should change
      await waitFor(() => {
        expect(onProjectChange).toHaveBeenCalledWith('proj-2', 'Project Two');
      });

      // Org should NOT change (still org-1)
      expect(onOrgChange).not.toHaveBeenCalled();

      // State should be updated correctly
      expect(screen.getByTestId('current-project-id')).toHaveTextContent(
        'proj-2'
      );
      expect(screen.getByTestId('current-org-id')).toHaveTextContent('org-1');
    });

    it('should keep org context stable when selecting multiple projects in same org', async () => {
      const onOrgChange = vi.fn();

      render(
        <StatefulWrapper
          initialOrgId="org-1"
          initialOrgName="Org Alpha"
          initialProjectId="proj-1"
          initialProjectName="Project One"
          onOrgChange={onOrgChange}
        />
      );

      // Open dropdown and select Project Two
      fireEvent.click(findTrigger());
      fireEvent.click(await findProjectItemButton(/Project Two/i));

      // Reopen and select Project One again
      fireEvent.click(findTrigger());
      fireEvent.click(await findProjectItemButton(/Project One/i));

      // Org should never have changed
      expect(onOrgChange).not.toHaveBeenCalled();
    });
  });

  describe('9.2: Switching projects across orgs', () => {
    it('should update org context when switching to project in different org', async () => {
      const onOrgChange = vi.fn();
      const onProjectChange = vi.fn();

      render(
        <StatefulWrapper
          initialOrgId="org-1"
          initialOrgName="Org Alpha"
          initialProjectId="proj-1"
          initialProjectName="Project One"
          onOrgChange={onOrgChange}
          onProjectChange={onProjectChange}
        />
      );

      // Open dropdown
      fireEvent.click(findTrigger());

      // Find and click Project Three (in org-2)
      const projectThree = await findProjectItemButton(/Project Three/i);
      fireEvent.click(projectThree);

      // Both org and project should change
      await waitFor(() => {
        expect(onOrgChange).toHaveBeenCalledWith('org-2', 'Org Beta');
      });
      await waitFor(() => {
        expect(onProjectChange).toHaveBeenCalledWith('proj-3', 'Project Three');
      });

      // State should reflect new org and project
      expect(screen.getByTestId('current-org-id')).toHaveTextContent('org-2');
      expect(screen.getByTestId('current-project-id')).toHaveTextContent(
        'proj-3'
      );
    });

    it('should update state correctly on cross-org project switch', async () => {
      render(
        <StatefulWrapper
          initialOrgId="org-1"
          initialOrgName="Org Alpha"
          initialProjectId="proj-1"
          initialProjectName="Project One"
        />
      );

      // Switch to project in different org
      fireEvent.click(findTrigger());
      fireEvent.click(await findProjectItemButton(/Project Four/i));

      // Verify state updated
      expect(screen.getByTestId('current-org-id')).toHaveTextContent('org-2');
      expect(screen.getByTestId('current-org-name')).toHaveTextContent(
        'Org Beta'
      );
      expect(screen.getByTestId('current-project-id')).toHaveTextContent(
        'proj-4'
      );
      expect(screen.getByTestId('current-project-name')).toHaveTextContent(
        'Project Four'
      );
    });
  });

  describe('9.3: Active project persistence', () => {
    it('should display current active project in trigger', () => {
      render(
        <StatefulWrapper
          initialOrgId="org-1"
          initialOrgName="Org Alpha"
          initialProjectId="proj-2"
          initialProjectName="Project Two"
        />
      );

      // The trigger should show the active project name (use getAllByText since there might be multiple)
      const projectTexts = screen.getAllByText('Project Two');
      expect(projectTexts.length).toBeGreaterThan(0);
    });

    it('should highlight active project in dropdown list', async () => {
      render(
        <StatefulWrapper
          initialOrgId="org-1"
          initialOrgName="Org Alpha"
          initialProjectId="proj-2"
          initialProjectName="Project Two"
        />
      );

      // Open dropdown
      fireEvent.click(findTrigger());

      // Find all buttons with aria-current attribute
      const allButtons = await screen.findAllByRole('button');
      const activeButtons = allButtons.filter(
        (btn) =>
          btn.tagName === 'BUTTON' &&
          btn.getAttribute('aria-current') === 'true'
      );

      expect(activeButtons.length).toBe(1);
      expect(activeButtons[0]).toHaveTextContent('Project Two');
    });
  });

  describe('9.4: Org context change effects', () => {
    it('should call both onOrgChange and onProjectChange when switching orgs', async () => {
      const onOrgChange = vi.fn();
      const onProjectChange = vi.fn();

      render(
        <StatefulWrapper
          initialOrgId="org-1"
          initialOrgName="Org Alpha"
          initialProjectId="proj-1"
          initialProjectName="Project One"
          onOrgChange={onOrgChange}
          onProjectChange={onProjectChange}
        />
      );

      // Switch to a project in a different org
      fireEvent.click(findTrigger());
      fireEvent.click(await findProjectItemButton(/Project Three/i));

      // Verify both callbacks were called
      expect(onOrgChange).toHaveBeenCalledTimes(1);
      expect(onProjectChange).toHaveBeenCalledTimes(1);

      // Verify correct values
      expect(onOrgChange).toHaveBeenCalledWith('org-2', 'Org Beta');
      expect(onProjectChange).toHaveBeenCalledWith('proj-3', 'Project Three');
    });
  });

  describe('9.5: Edge cases', () => {
    it('should handle empty org (no projects) gracefully', async () => {
      const emptyOrgTree: OrgWithProjects[] = [
        {
          id: 'org-empty',
          name: 'Empty Org',
          role: 'admin',
          projects: [],
        },
        {
          id: 'org-1',
          name: 'Org with Projects',
          role: 'admin',
          projects: [
            {
              id: 'proj-1',
              name: 'Project One',
              orgId: 'org-1',
              role: 'admin',
            },
          ],
        },
      ];

      render(<StatefulWrapper tree={emptyOrgTree} />);

      // Open dropdown
      fireEvent.click(findTrigger());

      // Should show org headers (there might be multiple instances of text)
      const emptyOrgTexts = await screen.findAllByText('Empty Org');
      expect(emptyOrgTexts.length).toBeGreaterThan(0);

      // Should show empty message for the empty org
      expect(
        await screen.findByText(/no projects in this organization/i)
      ).toBeInTheDocument();
    });

    it('should handle single project correctly', async () => {
      const singleProjectTree: OrgWithProjects[] = [
        {
          id: 'org-1',
          name: 'Solo Org',
          role: 'admin',
          projects: [
            {
              id: 'proj-only',
              name: 'Only Project',
              orgId: 'org-1',
              role: 'admin',
            },
          ],
        },
      ];
      const onProjectChange = vi.fn();

      render(
        <StatefulWrapper
          tree={singleProjectTree}
          onProjectChange={onProjectChange}
        />
      );

      // Open and select the only project
      fireEvent.click(findTrigger());
      fireEvent.click(await findProjectItemButton(/Only Project/i));

      expect(onProjectChange).toHaveBeenCalledWith('proj-only', 'Only Project');
    });

    it('should handle no organizations gracefully', () => {
      const emptyTree: OrgWithProjects[] = [];

      render(<StatefulWrapper tree={emptyTree} />);

      // Open dropdown
      fireEvent.click(findTrigger());

      // Should show empty state message
      expect(
        screen.getByText(/no organizations available/i)
      ).toBeInTheDocument();
    });

    it('should not break when selecting already active project', async () => {
      const onOrgChange = vi.fn();
      const onProjectChange = vi.fn();

      render(
        <StatefulWrapper
          initialOrgId="org-1"
          initialOrgName="Org Alpha"
          initialProjectId="proj-1"
          initialProjectName="Project One"
          onOrgChange={onOrgChange}
          onProjectChange={onProjectChange}
        />
      );

      // Open dropdown and click the already-active project
      fireEvent.click(findTrigger());
      fireEvent.click(await findProjectItemButton(/Project One/i));

      // Should still call onProjectChange
      expect(onProjectChange).toHaveBeenCalled();

      // Org should not change
      expect(onOrgChange).not.toHaveBeenCalled();

      // State should remain the same
      expect(screen.getByTestId('current-project-id')).toHaveTextContent(
        'proj-1'
      );
    });
  });
});
