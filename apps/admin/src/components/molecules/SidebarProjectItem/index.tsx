// Molecule: SidebarProjectItem (migrated from layout/sidebar/ProjectDropdown/ProjectItem)
// TODO(atomic-migrate): remove legacy shim after 2025-11
import { Icon } from '@/components/atoms/Icon';
import type { Project } from '@/hooks/use-projects';
import React, { forwardRef } from 'react';

export interface SidebarProjectItemProps {
  project: Project;
  active?: boolean;
  orgName?: string;
  onSelect?: (id: string, name: string) => void;
  /** Tab index for roving tabindex pattern */
  tabIndex?: number;
  /** Keyboard event handler for roving tabindex */
  onKeyDown?: (e: React.KeyboardEvent) => void;
  /** Focus event handler for roving tabindex */
  onFocus?: () => void;
}

export const SidebarProjectItem = forwardRef<
  HTMLButtonElement,
  SidebarProjectItemProps
>(function SidebarProjectItem(
  { project, active = false, orgName, onSelect, tabIndex, onKeyDown, onFocus },
  ref
) {
  return (
    <button
      ref={ref}
      className="flex justify-between items-center w-full text-left"
      onClick={() => onSelect?.(project.id, project.name)}
      aria-current={active ? 'true' : undefined}
      type="button"
      tabIndex={tabIndex}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
    >
      <div className="flex items-center gap-2">
        <div className="flex justify-center items-center bg-primary/20 rounded-box size-8">
          <div className="bg-primary size-5 mask mask-hexagon-2" />
        </div>
        <div className="text-left">
          <p className="font-medium text-sm truncate" title={project.name}>
            {project.name}
          </p>
          {orgName && (
            <p className="opacity-60 mt-0.5 text-xs truncate" title={orgName}>
              {orgName}
            </p>
          )}
        </div>
      </div>
      {active && <Icon icon="lucide--check" className="size-4" />}
    </button>
  );
});

export default SidebarProjectItem;
