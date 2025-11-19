// Organism: SidebarProjectDropdown (migrated from layout/sidebar/ProjectDropdown)
// TODO(atomic-migrate): remove legacy shim after 2025-11
import { Icon } from '@/components/atoms/Icon';
import { SidebarProjectItem } from '@/components/molecules/SidebarProjectItem';
import { useAccessTreeContext } from '@/contexts/access-tree';
import { useMemo } from 'react';

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

  // Close dropdown helper
  const closeDropdown = () => {
    // Remove focus from dropdown to close it
    const activeElement = document.activeElement as HTMLElement;
    if (activeElement) {
      activeElement.blur();
    }
  };

  return (
    <div
      className={`dropdown-bottom w-full dropdown dropdown-end ${className}`.trim()}
    >
      <div
        tabIndex={0}
        role="button"
        className="flex items-center gap-2.5 bg-base-200 hover:bg-base-300 mx-2.5 mt-1 px-3 py-2 rounded-box transition-all cursor-pointer"
      >
        <div className="flex justify-center items-center bg-primary/20 rounded-box size-8">
          <div className="bg-primary size-5 mask mask-hexagon-2" />
        </div>
        <div className="-space-y-0.5 grow">
          <p className="font-medium text-sm truncate" title={label}>
            {label}
          </p>
          {isActive && activeOrgName && (
            <p
              className="text-xs text-base-content/60 truncate"
              title={activeOrgName}
            >
              {activeOrgName}
            </p>
          )}
          {isActive && !activeOrgName && (
            <p className="text-xs text-base-content/60">No organization</p>
          )}
          {!isActive && (
            <p className="text-xs text-base-content/60">No project selected</p>
          )}
        </div>
        <Icon
          icon="lucide--chevrons-up-down"
          className="size-4 text-base-content/60"
        />
      </div>
      <div
        tabIndex={0}
        className="bg-base-100 shadow-[0px_10px_40px_0px] shadow-base-content/10 mt-1 p-0 rounded-box w-60 dropdown-content"
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
            tree.map((org) => (
              <div key={org.id} className="mb-3 last:mb-0">
                {/* Organization Header (non-interactive) */}
                <div
                  className="px-3 py-1.5 text-xs font-semibold text-base-content/70 uppercase tracking-wide"
                  role="heading"
                  aria-level={3}
                >
                  {org.name}
                </div>
                {/* Projects under this organization */}
                {org.projects.length === 0 ? (
                  <div className="px-3 py-2 ml-2 text-xs text-base-content/50 italic">
                    No projects in this organization
                  </div>
                ) : (
                  <ul className="space-y-1 menu">
                    {org.projects.map((project) => (
                      <li key={project.id}>
                        <SidebarProjectItem
                          project={project}
                          active={project.id === activeProjectId}
                          orgName={org.name}
                          onSelect={(id, name) => {
                            // Pass both project and org info to parent
                            onSelectProject?.(id, name, org.id, org.name);
                            closeDropdown();
                          }}
                        />
                      </li>
                    ))}
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
            ))}
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
