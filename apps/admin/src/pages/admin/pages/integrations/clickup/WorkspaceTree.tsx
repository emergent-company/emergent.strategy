import { useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import type { ClickUpWorkspaceStructure, ClickUpSpace, ClickUpFolder, ClickUpList } from '@/api/integrations';

export interface WorkspaceTreeProps {
    structure: ClickUpWorkspaceStructure;
    selectedListIds: string[];
    onSelectionChange: (listIds: string[]) => void;
}

type TreeState = {
    expandedSpaces: Set<string>;
    expandedFolders: Set<string>;
};

export function WorkspaceTree({ structure, selectedListIds, onSelectionChange }: WorkspaceTreeProps) {
    // Collect all folder IDs for initial expansion
    const allFolderIds = structure.spaces.flatMap(space => space.folders.map(folder => folder.id));

    const [treeState, setTreeState] = useState<TreeState>({
        expandedSpaces: new Set(structure.spaces.map(s => s.id)),
        expandedFolders: new Set(allFolderIds), // Expand all folders by default
    });

    const toggleSpaceExpansion = (spaceId: string) => {
        setTreeState(prev => {
            const newExpanded = new Set(prev.expandedSpaces);
            if (newExpanded.has(spaceId)) {
                newExpanded.delete(spaceId);
            } else {
                newExpanded.add(spaceId);
            }
            return { ...prev, expandedSpaces: newExpanded };
        });
    };

    const toggleFolderExpansion = (folderId: string) => {
        setTreeState(prev => {
            const newExpanded = new Set(prev.expandedFolders);
            if (newExpanded.has(folderId)) {
                newExpanded.delete(folderId);
            } else {
                newExpanded.add(folderId);
            }
            return { ...prev, expandedFolders: newExpanded };
        });
    };

    const toggleList = (listId: string) => {
        const newSelection = selectedListIds.includes(listId)
            ? selectedListIds.filter(id => id !== listId)
            : [...selectedListIds, listId];
        onSelectionChange(newSelection);
    };

    const getSpaceListIds = (space: ClickUpSpace): string[] => {
        const listIds: string[] = [];
        space.folders.forEach(folder => {
            folder.lists.forEach(list => listIds.push(list.id));
        });
        space.lists.forEach(list => listIds.push(list.id));
        return listIds;
    };

    const getFolderListIds = (folder: ClickUpFolder): string[] => {
        return folder.lists.map(list => list.id);
    };

    const isSpacePartiallySelected = (space: ClickUpSpace): boolean => {
        const spaceListIds = getSpaceListIds(space);
        const selectedCount = spaceListIds.filter(id => selectedListIds.includes(id)).length;
        return selectedCount > 0 && selectedCount < spaceListIds.length;
    };

    const isSpaceFullySelected = (space: ClickUpSpace): boolean => {
        const spaceListIds = getSpaceListIds(space);
        return spaceListIds.length > 0 && spaceListIds.every(id => selectedListIds.includes(id));
    };

    const isFolderPartiallySelected = (folder: ClickUpFolder): boolean => {
        const folderListIds = getFolderListIds(folder);
        const selectedCount = folderListIds.filter(id => selectedListIds.includes(id)).length;
        return selectedCount > 0 && selectedCount < folderListIds.length;
    };

    const isFolderFullySelected = (folder: ClickUpFolder): boolean => {
        const folderListIds = getFolderListIds(folder);
        return folderListIds.length > 0 && folderListIds.every(id => selectedListIds.includes(id));
    };

    const toggleSpace = (space: ClickUpSpace) => {
        const spaceListIds = getSpaceListIds(space);
        const isFullySelected = isSpaceFullySelected(space);

        if (isFullySelected) {
            // Deselect all lists in space
            onSelectionChange(selectedListIds.filter(id => !spaceListIds.includes(id)));
        } else {
            // Select all lists in space
            const newSelection = [...selectedListIds];
            spaceListIds.forEach(id => {
                if (!newSelection.includes(id)) {
                    newSelection.push(id);
                }
            });
            onSelectionChange(newSelection);
        }
    };

    const toggleFolder = (folder: ClickUpFolder) => {
        const folderListIds = getFolderListIds(folder);
        const isFullySelected = isFolderFullySelected(folder);

        if (isFullySelected) {
            // Deselect all lists in folder
            onSelectionChange(selectedListIds.filter(id => !folderListIds.includes(id)));
        } else {
            // Select all lists in folder
            const newSelection = [...selectedListIds];
            folderListIds.forEach(id => {
                if (!newSelection.includes(id)) {
                    newSelection.push(id);
                }
            });
            onSelectionChange(newSelection);
        }
    };

    const handleSelectAll = () => {
        const allListIds: string[] = [];
        structure.spaces.forEach(space => {
            allListIds.push(...getSpaceListIds(space));
        });
        onSelectionChange(allListIds);
    };

    const handleDeselectAll = () => {
        onSelectionChange([]);
    };

    const handleExpandAll = () => {
        const allFolderIds = structure.spaces.flatMap(space => space.folders.map(folder => folder.id));
        setTreeState({
            expandedSpaces: new Set(structure.spaces.map(s => s.id)),
            expandedFolders: new Set(allFolderIds),
        });
    };

    const handleCollapseAll = () => {
        setTreeState({
            expandedSpaces: new Set(),
            expandedFolders: new Set(),
        });
    };

    const renderCheckbox = (isChecked: boolean, isPartial: boolean, onClick: () => void) => (
        <input
            type="checkbox"
            className="checkbox checkbox-sm checkbox-primary"
            checked={isChecked}
            ref={el => {
                if (el) {
                    el.indeterminate = isPartial;
                }
            }}
            onChange={onClick}
        />
    );

    const renderList = (list: ClickUpList) => {
        const isSelected = selectedListIds.includes(list.id);
        return (
            <div
                key={list.id}
                className="flex items-center gap-2 hover:bg-base-200 px-4 py-2 rounded cursor-pointer"
                onClick={() => toggleList(list.id)}
            >
                {renderCheckbox(isSelected, false, () => toggleList(list.id))}
                <Icon icon="lucide--list" className="flex-shrink-0 w-4 h-4 text-base-content/60" />
                <span className="flex-1 text-sm">{list.name}</span>
                {list.task_count > 0 && (
                    <span className="badge badge-sm badge-ghost">
                        {list.task_count} tasks
                    </span>
                )}
            </div>
        );
    };

    const renderFolder = (folder: ClickUpFolder, spaceId: string) => {
        const isExpanded = treeState.expandedFolders.has(folder.id);
        const isPartial = isFolderPartiallySelected(folder);
        const isChecked = isFolderFullySelected(folder);

        return (
            <div key={folder.id} className="ml-6">
                <div className="flex items-center gap-2 hover:bg-base-200 px-2 py-2 rounded">
                    <button
                        className="btn btn-xs btn-ghost btn-square"
                        onClick={() => toggleFolderExpansion(folder.id)}
                    >
                        <Icon
                            icon={isExpanded ? 'lucide--chevron-down' : 'lucide--chevron-right'}
                            className="w-3 h-3"
                        />
                    </button>
                    {renderCheckbox(isChecked, isPartial, () => toggleFolder(folder))}
                    <Icon icon="lucide--folder" className="flex-shrink-0 w-4 h-4 text-warning" />
                    <span className="flex-1 font-medium text-sm">{folder.name}</span>
                    <span className="text-xs text-base-content/50">
                        {folder.lists.length} lists
                    </span>
                </div>
                {isExpanded && (
                    <div className="ml-4">
                        {folder.lists.map(renderList)}
                    </div>
                )}
            </div>
        );
    };

    const renderSpace = (space: ClickUpSpace) => {
        const isExpanded = treeState.expandedSpaces.has(space.id);
        const isPartial = isSpacePartiallySelected(space);
        const isChecked = isSpaceFullySelected(space);

        return (
            <div key={space.id} className="mb-2">
                <div className="flex items-center gap-2 hover:bg-base-200 px-2 py-2 rounded">
                    <button
                        className="btn btn-xs btn-ghost btn-square"
                        onClick={() => toggleSpaceExpansion(space.id)}
                    >
                        <Icon
                            icon={isExpanded ? 'lucide--chevron-down' : 'lucide--chevron-right'}
                            className="w-3 h-3"
                        />
                    </button>
                    {renderCheckbox(isChecked, isPartial, () => toggleSpace(space))}
                    <Icon icon="lucide--box" className="flex-shrink-0 w-4 h-4 text-info" />
                    <span className="flex-1 font-semibold">{space.name}</span>
                    <span className="text-xs text-base-content/50">
                        {space.folders.length + space.lists.length} {space.folders.length + space.lists.length === 1 ? 'item' : 'items'}
                    </span>
                </div>
                {isExpanded && (
                    <div className="ml-2">
                        {space.folders.map(folder => renderFolder(folder, space.id))}
                        {space.lists.length > 0 && (
                            <div className="mt-2 ml-6">
                                <div className="mb-1 px-2 font-semibold text-xs text-base-content/60">
                                    Lists (no folder)
                                </div>
                                {space.lists.map(renderList)}
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="p-4 border border-base-300 rounded-lg max-h-[500px] overflow-y-auto" data-testid="clickup-workspace-tree">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-base-300">
                <div className="font-semibold text-sm">Spaces & Lists</div>
                <div className="flex gap-2">
                    <button
                        className="btn btn-xs btn-ghost"
                        onClick={handleSelectAll}
                        data-testid="clickup-sync-select-all-button"
                    >
                        Select All
                    </button>
                    <button
                        className="btn btn-xs btn-ghost"
                        onClick={handleDeselectAll}
                        disabled={selectedListIds.length === 0}
                        data-testid="clickup-sync-deselect-all-button"
                    >
                        Deselect All
                    </button>
                </div>
            </div>
            {structure.spaces.length === 0 ? (
                <div className="py-8 text-base-content/60 text-center">
                    <Icon icon="lucide--inbox" className="opacity-50 mx-auto mb-2 w-12 h-12" />
                    <p>No spaces found in workspace</p>
                </div>
            ) : (
                <div>
                    {structure.spaces.map(renderSpace)}
                </div>
            )}
        </div>
    );
}
