// Organism: SidebarProjectDropdown (migrated from layout/sidebar/ProjectDropdown)
// TODO(atomic-migrate): remove legacy shim after 2025-11
import { Icon } from '@/components/atoms/Icon';
import { SidebarProjectItem } from '@/components/molecules/SidebarProjectItem';
import { useAccessTreeContext } from '@/contexts/access-tree';
import { useRovingTabindex } from '@/hooks/use-roving-tabindex';
import { useCallback, useMemo, useRef } from 'react';

export interface SidebarProjectDropdownProps {
  activeProjectId?: string;
  activeProjectName?: string;
  loading?: boolean;
  errorMsg?: string;
  onSelectProject?: (
    projectId: string,
    projectName: string,
    orgId: string,
    orgName: string
  ) => void;
  onAddProject?: (orgId: string, orgName: string) => void;
  onAddOrganization?: () => void;
  className?: string;
}

export function SidebarProjectDropdown({
  activeProjectId,
  activeProjectName,
  loading = false,
  errorMsg,
  onSelectProject,
  onAddProject,
  onAddOrganization,
  className = '',
}: SidebarProjectDropdownProps) {
  const {
    tree,
    projects: allProjects,
    loading: treeLoading,
  } = useAccessTreeContext();

  const triggerRef = useRef<HTMLDivElement>(null);

  // Use tree loading state if provided, otherwise use prop
  const isLoading = treeLoading || loading;

  const label = activeProjectName || 'Select project';
  const isActive = !!activeProjectId;

  // Find active project and its org name
  const activeProject = useMemo(
    () => allProjects.find((p) => p.id === activeProjectId),
    [allProjects, activeProjectId]
  );

  const activeOrgName = useMemo(() => {
    if (!activeProject?.orgId) return undefined;
    const org = tree.find((o) => o.id === activeProject.orgId);
    return org?.name;
  }, [activeProject, tree]);

  // Create flat list of projects with their org info for keyboard navigation
  // Also create a map from project ID to flat index for efficient lookup
  const { flatProjectList, projectIndexMap } = useMemo(() => {
    const list: Array<{
      project: (typeof tree)[0]['projects'][0];
      org: (typeof tree)[0];
      flatIndex: number;
    }> = [];
    const indexMap = new Map<string, number>();
    tree.forEach((org) => {
      org.projects.forEach((project) => {
        const idx = list.length;
        list.push({ project, org, flatIndex: idx });
        indexMap.set(project.id, idx);
      });
    });
    return { flatProjectList: list, projectIndexMap: indexMap };
  }, [tree]);

  // Close dropdown helper
  const closeDropdown = useCallback(() => {
    // Remove focus from dropdown to close it
    const activeElement = document.activeElement as HTMLElement;
    if (activeElement) {
      activeElement.blur();
    }
    // Return focus to trigger
    triggerRef.current?.focus();
  }, []);

  // Handle project selection from keyboard
  const handleSelectByIndex = useCallback(
    (index: number) => {
      const item = flatProjectList[index];
      if (item) {
        onSelectProject?.(
          item.project.id,
          item.project.name,
          item.org.id,
          item.org.name
        );
        closeDropdown();
      }
    },
    [flatProjectList, onSelectProject, closeDropdown]
  );

  // Roving tabindex for keyboard navigation
  const { getItemProps, resetFocus } = useRovingTabindex({
    itemCount: flatProjectList.length,
    wrap: true,
    orientation: 'vertical',
    onSelect: handleSelectByIndex,
    onEscape: closeDropdown,
  });

  // Reset focus when dropdown opens
  const handleTriggerKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        // Dropdown will open, reset roving focus
        resetFocus();
      }
    },
    [resetFocus]
  );

  return (
    <div
      className={`dropdown-bottom w-full dropdown dropdown-end mb-2 ${className}`.trim()}
      role="listbox"
      aria-label="Project selector"
    >
      <div
        ref={triggerRef}
        tabIndex={0}
        role="button"
        aria-haspopup="listbox"
        aria-expanded="false"
        className="group flex items-center gap-2 px-2.5 py-1.5 cursor-pointer"
        onKeyDown={handleTriggerKeyDown}
      >
        <div className="bg-primary shrink-0 size-3.5 mask mask-hexagon-2" />
        <div className="grow min-w-0">
          <p className="font-medium text-sm truncate" title={label}>
            {label}
          </p>
        </div>
        <div className="flex items-center justify-center size-6 rounded group-hover:bg-base-200 transition-colors">
          <Icon
            icon="lucide--chevrons-up-down"
            className="size-4 text-base-content/60"
          />
        </div>
      </div>
      <div
        tabIndex={0}
        className="bg-base-100 shadow-[0px_10px_40px_0px] shadow-base-content/10 mt-1 p-0 rounded-box w-60 dropdown-content"
        role="listbox"
        aria-label="Projects grouped by organization"
      >
        <div className="p-2 w-full max-h-72 overflow-auto">
          {isLoading && (
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="rounded w-4 h-4 skeleton" />
              <span className="w-28 h-3 skeleton" />
            </div>
          )}
          {!isLoading && tree.length === 0 && (
            <div className="px-3 py-2 opacity-70 text-sm">
              No organizations available
            </div>
          )}
          {!isLoading &&
            tree.map((org) => {
              const orgProjects = org.projects.map((project) => {
                const currentFlatIndex = projectIndexMap.get(project.id) ?? 0;
                const itemProps = getItemProps(currentFlatIndex);
                return (
                  <li
                    key={project.id}
                    role="option"
                    aria-selected={project.id === activeProjectId}
                  >
                    <SidebarProjectItem
                      ref={itemProps.ref as React.Ref<HTMLButtonElement>}
                      project={project}
                      active={project.id === activeProjectId}
                      tabIndex={itemProps.tabIndex}
                      onKeyDown={itemProps.onKeyDown}
                      onFocus={itemProps.onFocus}
                      onSelect={(id, name) => {
                        // Pass both project and org info to parent
                        onSelectProject?.(id, name, org.id, org.name);
                        closeDropdown();
                      }}
                    />
                  </li>
                );
              });

              return (
                <div
                  key={org.id}
                  className="mb-3 last:mb-0"
                  role="group"
                  aria-label={org.name}
                >
                  {/* Organization Header (non-interactive) */}
                  <div
                    className="px-3 py-1.5 text-xs font-semibold text-base-content/70 uppercase tracking-wide"
                    role="heading"
                    aria-level={3}
                    id={`org-header-${org.id}`}
                  >
                    {org.name}
                  </div>
                  {/* Projects under this organization */}
                  {org.projects.length === 0 ? (
                    <div className="px-3 py-2 ml-2 text-xs text-base-content/50 italic">
                      No projects in this organization
                    </div>
                  ) : (
                    <ul
                      className="space-y-1 menu"
                      aria-labelledby={`org-header-${org.id}`}
                    >
                      {orgProjects}
                    </ul>
                  )}
                  {/* Add Project button for this org */}
                  {onAddProject && (
                    <button
                      type="button"
                      className="btn btn-xs btn-ghost gap-1 mt-1 ml-2 text-xs"
                      onClick={() => {
                        onAddProject(org.id, org.name);
                        closeDropdown();
                      }}
                    >
                      <Icon icon="lucide--plus" className="size-3" />
                      <span>Add Project</span>
                    </button>
                  )}
                </div>
              );
            })}
        </div>
        {(onAddOrganization || errorMsg) && (
          <div className="border-t border-base-300 px-2 pt-2 pb-2">
            {errorMsg && (
              <div
                className="mb-2 text-error text-xs truncate"
                title={errorMsg}
              >
                {errorMsg}
              </div>
            )}
            {onAddOrganization && (
              <button
                type="button"
                className="btn btn-sm btn-ghost w-full gap-1 text-xs"
                onClick={() => {
                  onAddOrganization();
                  closeDropdown();
                }}
              >
                <Icon icon="lucide--building-2" className="size-3.5" />
                <span>Add Organization</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default SidebarProjectDropdown;
