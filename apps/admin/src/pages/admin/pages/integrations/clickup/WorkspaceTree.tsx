import { Icon } from '@/components/atoms/Icon';
import type { ClickUpWorkspaceStructure } from '@/api/integrations';
import { useState } from 'react';

export type SelectionMode = 'spaces';

export interface WorkspaceTreeProps {
    structure: ClickUpWorkspaceStructure;
    selectedSpaceIds: string[];
    onSpaceSelectionChange: (spaceIds: string[]) => void;
    mode: SelectionMode;
    selectedDocIds?: string[];
    onDocSelectionChange?: (docIds: string[]) => void;
}

export function WorkspaceTree({
    structure,
    selectedSpaceIds,
    onSpaceSelectionChange,
    selectedDocIds = [],
    onDocSelectionChange,
}: WorkspaceTreeProps) {
    const [expandedSpaces, setExpandedSpaces] = useState<Set<string>>(new Set());

    const toggleSpace = (spaceId: string) => {
        const isSelected = selectedSpaceIds.includes(spaceId);
        if (isSelected) {
            onSpaceSelectionChange(selectedSpaceIds.filter(id => id !== spaceId));
        } else {
            onSpaceSelectionChange([...selectedSpaceIds, spaceId]);
        }
    };

    const toggleSpaceExpanded = (spaceId: string) => {
        const newExpanded = new Set(expandedSpaces);
        if (newExpanded.has(spaceId)) {
            newExpanded.delete(spaceId);
        } else {
            newExpanded.add(spaceId);
        }
        setExpandedSpaces(newExpanded);
    };

    const toggleDocument = (docId: string) => {
        if (!onDocSelectionChange) return;

        const isSelected = selectedDocIds.includes(docId);
        if (isSelected) {
            onDocSelectionChange(selectedDocIds.filter(id => id !== docId));
        } else {
            onDocSelectionChange([...selectedDocIds, docId]);
        }
    };

    const handleSelectAll = () => {
        onSpaceSelectionChange(structure.spaces.map(s => s.id));

        // Also select all documents if document selection is enabled
        if (onDocSelectionChange) {
            const allDocIds = structure.spaces.flatMap(s => s.documents.map(d => d.id));
            onDocSelectionChange(allDocIds);
        }
    };

    const handleDeselectAll = () => {
        onSpaceSelectionChange([]);
        if (onDocSelectionChange) {
            onDocSelectionChange([]);
        }
    };

    // Calculate total document count
    const totalDocs = structure.spaces.reduce((sum, space) => sum + space.documents.length, 0);

    return (
        <div className="p-4 border border-base-300 rounded-lg max-h-[500px] overflow-y-auto" data-testid="clickup-workspace-tree">
            <div className="flex justify-between items-center mb-4 pb-2 border-base-300 border-b">
                <div className="font-semibold text-sm">
                    Spaces {totalDocs > 0 && <span className="text-base-content/60">({totalDocs} documents)</span>}
                </div>
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
                        disabled={selectedSpaceIds.length === 0 && selectedDocIds.length === 0}
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
                <div className="space-y-1">
                    {structure.spaces.map(space => {
                        const isSpaceSelected = selectedSpaceIds.includes(space.id);
                        const isExpanded = expandedSpaces.has(space.id);
                        const hasDocuments = space.documents.length > 0;

                        return (
                            <div key={space.id}>
                                {/* Space Row */}
                                <div
                                    className="flex items-center gap-2 hover:bg-base-200 px-2 py-2 rounded"
                                >
                                    {/* Expand/Collapse Button */}
                                    {hasDocuments && (
                                        <button
                                            className="p-0 w-5 h-5 min-h-0 btn btn-xs btn-ghost btn-square"
                                            onClick={() => toggleSpaceExpanded(space.id)}
                                        >
                                            <Icon
                                                icon={isExpanded ? "lucide--chevron-down" : "lucide--chevron-right"}
                                                className="w-4 h-4"
                                            />
                                        </button>
                                    )}
                                    {!hasDocuments && <div className="w-5" />}

                                    {/* Space Checkbox */}
                                    <input
                                        type="checkbox"
                                        className="checkbox checkbox-sm checkbox-primary"
                                        checked={isSpaceSelected}
                                        onChange={() => toggleSpace(space.id)}
                                    />

                                    {/* Space Icon & Name */}
                                    <div
                                        className="flex flex-1 items-center gap-2 cursor-pointer"
                                        onClick={() => toggleSpace(space.id)}
                                    >
                                        <Icon icon="lucide--box" className="flex-shrink-0 w-4 h-4 text-info" />
                                        <span className="flex-1 font-semibold text-sm">{space.name}</span>
                                        {space.documents.length > 0 && (
                                            <span className="badge badge-sm badge-ghost">
                                                {space.documents.length} {space.documents.length === 1 ? 'doc' : 'docs'}
                                            </span>
                                        )}
                                        {space.archived && (
                                            <span className="badge badge-sm badge-ghost">
                                                Archived
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Documents List (when expanded) */}
                                {isExpanded && hasDocuments && (
                                    <div className="space-y-1 mt-1 ml-7">
                                        {space.documents.map(doc => {
                                            const isDocSelected = selectedDocIds.includes(doc.id);

                                            return (
                                                <div
                                                    key={doc.id}
                                                    className="flex items-center gap-2 hover:bg-base-200 px-2 py-1.5 rounded cursor-pointer"
                                                    onClick={() => onDocSelectionChange && toggleDocument(doc.id)}
                                                >
                                                    {onDocSelectionChange && (
                                                        <input
                                                            type="checkbox"
                                                            className="checkbox checkbox-xs checkbox-primary"
                                                            checked={isDocSelected}
                                                            onChange={() => toggleDocument(doc.id)}
                                                        />
                                                    )}
                                                    <Icon icon="lucide--file-text" className="flex-shrink-0 w-3.5 h-3.5 text-base-content/60" />
                                                    <span className="flex-1 text-sm">{doc.name}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
