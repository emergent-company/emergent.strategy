// Organism: SidebarProjectDropdown (migrated from layout/sidebar/ProjectDropdown)
// TODO(atomic-migrate): remove legacy shim after 2025-11
import { Icon } from '@/components/atoms/Icon';
import type { Project } from '@/hooks/use-projects';
import { SidebarProjectItem } from '@/components/molecules/SidebarProjectItem';

export interface SidebarProjectDropdownProps {
    activeProjectId?: string;
    activeProjectName?: string;
    projects?: Project[];
    loading?: boolean;
    errorMsg?: string;
    onSelectProject?: (id: string, name: string) => void;
    onAddProject?: () => void;
    className?: string;
}

export function SidebarProjectDropdown({
    activeProjectId,
    activeProjectName,
    projects = [],
    loading = false,
    errorMsg,
    onSelectProject,
    onAddProject,
    className = '',
}: SidebarProjectDropdownProps) {
    const label = activeProjectName || 'Select project';
    const isActive = !!activeProjectId;
    return (
        <div className={`dropdown-bottom w-full dropdown dropdown-end ${className}`.trim()}>
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
                    <p className="text-xs text-base-content/60">{isActive ? 'Active' : 'No project selected'}</p>
                </div>
                <Icon icon="lucide--chevrons-up-down" className="size-4 text-base-content/60" />
            </div>
            <div
                tabIndex={0}
                className="bg-base-100 shadow-[0px_10px_40px_0px] shadow-base-content/10 mt-1 p-0 rounded-box w-60 dropdown-content"
            >
                <ul className="space-y-1 p-2 w-full max-h-72 overflow-auto menu">
                    {loading && (
                        <li className="disabled">
                            <div className="flex items-center gap-2">
                                <span className="rounded w-4 h-4 skeleton" />
                                <span className="w-28 h-3 skeleton" />
                            </div>
                        </li>
                    )}
                    {!loading && projects.length === 0 && (
                        <li className="disabled">
                            <div className="opacity-70">No projects</div>
                        </li>
                    )}
                    {!loading &&
                        projects.map((p) => (
                            <li key={p.id}>
                                <SidebarProjectItem project={p} active={p.id === activeProjectId} onSelect={onSelectProject} />
                            </li>
                        ))}
                </ul>
                <div className="flex justify-between items-center gap-2 px-2 pt-0 pb-2">
                    {errorMsg && (
                        <span className="text-error text-xs truncate" title={errorMsg}>
                            {errorMsg}
                        </span>
                    )}
                    {onAddProject && (
                        <button type="button" className="ms-auto link link-primary" onClick={onAddProject}>
                            Add project
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

export default SidebarProjectDropdown;
