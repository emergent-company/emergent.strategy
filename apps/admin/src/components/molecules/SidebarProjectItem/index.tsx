// Molecule: SidebarProjectItem (migrated from layout/sidebar/ProjectDropdown/ProjectItem)
// TODO(atomic-migrate): remove legacy shim after 2025-11
import { Icon } from '@/components/atoms/Icon';
import type { Project } from '@/hooks/use-projects';
import React from 'react';

export interface SidebarProjectItemProps {
    project: Project;
    active?: boolean;
    onSelect?: (id: string, name: string) => void;
}

export const SidebarProjectItem: React.FC<SidebarProjectItemProps> = ({ project, active = false, onSelect }) => {
    return (
        <button
            className="flex justify-between items-center w-full text-left"
            onClick={() => onSelect?.(project.id, project.name)}
            aria-current={active ? 'true' : undefined}
            type="button"
        >
            <div className="flex items-center gap-2">
                <div className="flex justify-center items-center bg-secondary/20 rounded-box size-8">
                    <div className="bg-secondary size-5 mask mask-star-2" />
                </div>
                <div className="text-left">
                    <p className="font-medium text-sm truncate" title={project.name}>
                        {project.name}
                    </p>
                    {project.status && (
                        <p className="opacity-60 mt-0.5 text-xs truncate" title={project.status}>
                            {project.status}
                        </p>
                    )}
                </div>
            </div>
            {active && <Icon icon="lucide--check" className="size-4" />}
        </button>
    );
};

export default SidebarProjectItem;
