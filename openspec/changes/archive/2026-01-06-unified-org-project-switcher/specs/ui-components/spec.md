# UI Components Specification Delta

## MODIFIED Requirements

### Requirement: Unified Organization & Project Switcher

The sidebar project dropdown SHALL display all organizations and their projects in a hierarchical, grouped structure.

#### Current Behavior

- Projects displayed as flat list
- Organization name shown as subtitle under project name
- Separate organization switcher exists in TopbarProfileMenu

#### New Behavior

- Projects grouped by organization
- Organization names shown as non-interactive group headers
- Projects indented under their organization
- Selecting a project automatically updates both project and org context
- Single dropdown handles all context switching

#### Scenario: User views grouped project list

**Given** the user has access to multiple organizations with projects  
**When** the user opens the project dropdown in the sidebar  
**Then** the dropdown displays:

- Organization names as group headers
- Projects indented under their respective organizations
- Current active project is highlighted
- Empty state if an org has no projects

#### Scenario: User switches project within same organization

**Given** the user is viewing "Project A" in "Org Alpha"  
**And** the dropdown shows projects grouped by organization  
**When** the user clicks "Project B" under "Org Alpha"  
**Then** the active project changes to "Project B"  
**And** the organization context remains "Org Alpha"  
**And** the dropdown trigger shows "Project B" with "Org Alpha" subtitle

#### Scenario: User switches project to different organization

**Given** the user is viewing "Project A" in "Org Alpha"  
**And** the dropdown shows projects grouped by organization  
**When** the user clicks "Project X" under "Org Beta"  
**Then** the active project changes to "Project X"  
**And** the organization context changes to "Org Beta"  
**And** the dropdown trigger shows "Project X" with "Org Beta" subtitle  
**And** dependent data refreshes based on new org context

#### Scenario: Organization has no projects

**Given** an organization "Empty Org" exists with no projects  
**When** the user opens the project dropdown  
**Then** "Empty Org" appears as a group header  
**And** a message "No projects in this organization" is displayed below the header  
**And** user cannot select anything under "Empty Org"

#### Scenario: User has no organizations

**Given** the user has no organization access  
**When** the dropdown is rendered  
**Then** it displays "No organizations available"  
**And** provides a way to create or join an organization

#### Scenario: Keyboard navigation in grouped list

**Given** the project dropdown is open with multiple orgs and projects  
**When** the user presses arrow down/up keys  
**Then** focus moves between projects (skipping non-interactive org headers)  
**And** pressing Enter selects the focused project  
**And** pressing Escape closes the dropdown

#### Technical Details

**Data Structure:**

```typescript
{
  tree: [
    {
      id: 'org-1',
      name: 'Organization Alpha',
      role: 'admin',
      projects: [
        { id: 'proj-1', name: 'Project A', orgId: 'org-1', role: 'admin' },
        { id: 'proj-2', name: 'Project B', orgId: 'org-1', role: 'member' },
      ],
    },
    {
      id: 'org-2',
      name: 'Organization Beta',
      role: 'member',
      projects: [
        { id: 'proj-3', name: 'Project X', orgId: 'org-2', role: 'admin' },
      ],
    },
  ];
}
```

**Rendering Logic:**

- Use `AccessTreeContext.tree` for hierarchical data
- Map over organizations as outer loop
- Render org name as styled group header
- Map over org.projects as inner loop
- Render each project with `SidebarProjectItem`
- Apply indentation CSS to project items

**Selection Handler:**

```typescript
const onSelectProject = (projectId: string, projectName: string) => {
  const project = findProjectInTree(projectId);
  if (project) {
    // If project is in different org, update org context first
    if (project.orgId !== config.activeOrgId) {
      const org = findOrgById(project.orgId);
      if (org) {
        setActiveOrg(org.id, org.name);
      }
    }
    // Then update project context
    setActiveProject(projectId, projectName);
  }
};
```

**Accessibility:**

- Organization headers: `role="heading"` with appropriate level
- Projects remain `role="button"` or `role="menuitem"`
- Add `aria-label` describing hierarchy (e.g., "Project A in Organization Alpha")
- Keyboard focus skips non-interactive headers

### Requirement: Simplified User Menu

The TopbarProfileMenu SHALL focus solely on user account actions and SHALL NOT include organization management functionality.

#### Current Behavior

- Displays user profile options (Profile, Settings, Help)
- Displays organization switcher with list of orgs
- Includes "Add organization" action
- Includes Logout

#### New Behavior

- Displays only user profile options (Profile, Settings, Help)
- Removes organization switcher section
- Organization management moved to sidebar
- Keeps Logout action

#### Scenario: User opens profile menu

**Given** the user is authenticated  
**When** the user clicks their avatar in the topbar  
**Then** a dropdown appears with:

- "My Profile" link
- "Settings" link
- "Help" link
- Divider
- "Switch Account" option
- "Logout" button  
  **And** no organization-related options are visible

#### Scenario: User accesses org management (future)

**Given** the user wants to manage organizations  
**When** they look for organization options  
**Then** they find these options in the sidebar project dropdown or settings  
**And** not in the profile menu

## ADDED Requirements

### Requirement: Organization Group Headers

Organization group headers in the project dropdown SHALL provide visual grouping and SHALL NOT be interactive.

#### Scenario: Org header displays correctly

**Given** the project dropdown is open  
**When** an organization with projects is rendered  
**Then** the org name appears as a header  
**And** the header has distinct styling (e.g., bold, different color)  
**And** the header is not clickable/hoverable as a button  
**And** projects appear indented below the header

#### Technical Details

**Styling:**

- Use neutral text color (e.g., `text-base-content/70`)
- Smaller font size than project names
- Bold or medium font weight
- Padding/margin to separate from projects
- Not part of interactive menu items

**HTML Structure:**

```tsx
<div className="px-3 py-2 text-xs font-semibold text-base-content/70">
  {org.name}
</div>
<ul className="pl-2">
  {/* Projects here */}
</ul>
```

### Requirement: Project Indentation

Projects SHALL be visually indented to indicate they belong to their parent organization.

#### Scenario: Projects appear indented

**Given** projects are rendered under an organization header  
**When** the user views the dropdown  
**Then** each project has left padding/margin indicating hierarchy  
**And** indentation is consistent across all orgs  
**And** indentation doesn't cause text overflow issues

#### Technical Details

**Implementation:**

- Add `pl-2` or `ml-2` class to project items
- Ensure consistent spacing
- Test with long names to avoid overflow

## REMOVED Requirements

### Requirement: Organization Switcher in Profile Menu

**Reason for Removal:** Redundant with unified sidebar switcher

**Previous Behavior:**

- Organization list in TopbarProfileMenu dropdown
- Clickable org names to switch active org
- Checkmark indicating active org
- "Add organization" action

**Impact:**

- Reduces UI complexity
- Consolidates context switching to single location
- Simplifies TopbarProfileMenu component

## Implementation Notes

1. **Data Source:** Use `AccessTreeContext.tree` which already provides hierarchical org → projects structure
2. **Performance:** Use `useMemo` to compute grouped structure once per data change
3. **Accessibility:** Ensure proper ARIA labels and keyboard navigation work with grouped structure
4. **Empty States:** Handle orgs with no projects gracefully (show message, don't just hide org)
5. **Migration:** No data migration needed; purely UI reorganization
6. **Testing:** Focus on cross-org project switching and org context updates
