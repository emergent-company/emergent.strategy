/**
 * Step 4: Review Relationships
 * 
 * Review and edit discovered relationships
 */

import { useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import type { Relationship } from './DiscoveryWizard';

interface Step4Props {
    relationships: Relationship[];
    onRelationshipsChange: (relationships: Relationship[]) => void;
    onGeneratePack: () => void;
    onBack: () => void;
}

export function Step4_ReviewRelationships({
    relationships,
    onRelationshipsChange,
    onGeneratePack,
    onBack,
}: Step4Props) {
    const [editingRel, setEditingRel] = useState<number | null>(null);
    const [editValue, setEditValue] = useState('');

    // Debug: Log relationships data
    console.log('[Step4] Relationships received:', relationships);
    if (relationships.length > 0) {
        console.log('[Step4] First relationship:', relationships[0]);
    }

    const startEdit = (idx: number, value: string) => {
        setEditingRel(idx);
        setEditValue(value);
    };

    const saveEdit = () => {
        if (editingRel !== null) {
            const updated = [...relationships];
            updated[editingRel] = {
                ...updated[editingRel],
                relation_type: editValue,  // Use relation_type instead of relationship_name
            };
            onRelationshipsChange(updated);
        }
        setEditingRel(null);
        setEditValue('');
    };

    const cancelEdit = () => {
        setEditingRel(null);
        setEditValue('');
    };

    const updateCardinality = (idx: number, cardinality: '1:1' | '1:N' | 'N:1' | 'N:M') => {
        const updated = [...relationships];
        updated[idx] = {
            ...updated[idx],
            cardinality,
        };
        onRelationshipsChange(updated);
    };

    const deleteRelationship = (idx: number) => {
        const updated = relationships.filter((_, i) => i !== idx);
        onRelationshipsChange(updated);
    };

    const getConfidenceColor = (confidence: number) => {
        if (confidence >= 0.8) return 'text-success';
        if (confidence >= 0.6) return 'text-warning';
        return 'text-error';
    };

    // Normalize cardinality values from database format to UI format
    const normalizeCardinality = (cardinality: string): '1:1' | '1:N' | 'N:1' | 'N:M' => {
        const mapping: Record<string, '1:1' | '1:N' | 'N:1' | 'N:M'> = {
            'one-to-one': '1:1',
            'one-to-many': '1:N',
            'many-to-one': 'N:1',
            'many-to-many': 'N:M',
            '1:1': '1:1',
            '1:N': '1:N',
            'N:1': 'N:1',
            'N:M': 'N:M',
        };
        return mapping[cardinality] || '1:N';
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h3 className="flex items-center gap-2 font-semibold">
                    <Icon icon="lucide--git-branch" className="size-5" />
                    Review Discovered Relationships
                </h3>
                <p className="mt-1 text-sm text-base-content/70">
                    Review and edit the relationships discovered between entity types.
                </p>
            </div>

            {/* Relationships Table */}
            {relationships.length === 0 ? (
                <div className="flex flex-col justify-center items-center py-12 text-center">
                    <Icon icon="lucide--inbox" className="size-16 text-base-content/30" />
                    <p className="mt-4 font-medium">No Relationships Discovered</p>
                    <p className="mt-1 text-sm text-base-content/70">
                        The discovery process didn't find any relationships between types.
                    </p>
                </div>
            ) : (
                <div className="space-y-2 overflow-x-auto">
                    {relationships.map((rel, idx) => (
                        <div key={idx} className="flex items-center gap-3 p-4 border border-base-300 rounded-lg">
                            {/* From Type */}
                            <div className="flex flex-1 items-center gap-2 min-w-[120px]">
                                <div className="flex flex-col gap-1">
                                    <span className="text-xs text-base-content/50 uppercase">From</span>
                                    <span className="badge badge-primary">{rel.source_type}</span>
                                </div>
                            </div>

                            {/* Relationship Name (Editable) */}
                            <div className="flex flex-[2] items-center gap-2 min-w-0">
                                {editingRel === idx ? (
                                    <input
                                        type="text"
                                        className="w-full input-bordered input input-sm"
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        onBlur={saveEdit}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') saveEdit();
                                            if (e.key === 'Escape') cancelEdit();
                                        }}
                                        autoFocus
                                    />
                                ) : (
                                    <div
                                        className="flex items-center gap-2 hover:text-primary cursor-pointer"
                                        onClick={() => startEdit(idx, rel.relation_type)}
                                    >
                                        <Icon icon="lucide--arrow-right" className="size-4" />
                                        <span className="font-medium">{rel.relation_type}</span>
                                    </div>
                                )}
                            </div>

                            {/* To Type */}
                            <div className="flex flex-1 items-center gap-2 min-w-[120px]">
                                <Icon icon="lucide--arrow-right" className="size-4 text-base-content/50" />
                                <div className="flex flex-col gap-1">
                                    <span className="text-xs text-base-content/50 uppercase">To</span>
                                    <span className="badge badge-secondary">{rel.target_type}</span>
                                </div>
                            </div>

                            {/* Cardinality Dropdown */}
                            <select
                                className="w-24 select-bordered select-sm select"
                                value={normalizeCardinality(rel.cardinality)}
                                onChange={(e) =>
                                    updateCardinality(idx, e.target.value as '1:1' | '1:N' | 'N:1' | 'N:M')
                                }
                            >
                                <option value="1:1">1:1</option>
                                <option value="1:N">1:N</option>
                                <option value="N:1">N:1</option>
                                <option value="N:M">N:M</option>
                            </select>

                            {/* Confidence */}
                            <div className={`text-sm font-medium ${getConfidenceColor(rel.confidence)}`}>
                                {Math.round(rel.confidence * 100)}%
                            </div>

                            {/* Actions */}
                            <button
                                className="text-error btn btn-ghost btn-sm btn-square"
                                onClick={() => deleteRelationship(idx)}
                                title="Delete relationship"
                            >
                                <Icon icon="lucide--trash-2" className="size-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Summary */}
            <div className="flex items-center gap-2 bg-base-200 p-4 border border-base-300 rounded-lg">
                <Icon icon="lucide--info" className="size-5 text-info" />
                <span className="text-sm">
                    <span className="font-medium">{relationships.length}</span> relationship
                    {relationships.length !== 1 ? 's' : ''} will be included in your template pack.
                </span>
            </div>

            {/* Cardinality Legend */}
            <details className="collapse collapse-arrow bg-base-100 border border-base-300 rounded-lg">
                <summary className="collapse-title font-medium text-sm">
                    What does cardinality mean?
                </summary>
                <div className="collapse-content space-y-2 text-sm">
                    <div>
                        <span className="font-medium">1:1</span> - Each instance of type A relates to exactly one
                        instance of type B
                    </div>
                    <div>
                        <span className="font-medium">1:N</span> - Each instance of type A can relate to many
                        instances of type B
                    </div>
                    <div>
                        <span className="font-medium">N:1</span> - Many instances of type A can relate to one
                        instance of type B
                    </div>
                    <div>
                        <span className="font-medium">N:M</span> - Many instances of type A can relate to many
                        instances of type B
                    </div>
                </div>
            </details>

            {/* Action Buttons */}
            <div className="flex justify-between items-center gap-3 pt-4">
                <button className="btn btn-ghost" onClick={onBack}>
                    Back
                </button>
                <button className="gap-2 btn btn-primary" onClick={onGeneratePack}>
                    <Icon icon="lucide--package-plus" className="size-4" />
                    Generate Template Pack
                </button>
            </div>
        </div>
    );
}
