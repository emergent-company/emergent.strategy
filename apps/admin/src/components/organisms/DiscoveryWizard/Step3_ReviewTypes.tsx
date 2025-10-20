/**
 * Step 3: Review Types
 * 
 * Review and edit discovered types
 */

import { useState, Component, ErrorInfo, ReactNode, Fragment } from 'react';
import { Icon } from '@/components/atoms/Icon';
import type { TypeCandidate } from './DiscoveryWizard';

interface Step3Props {
    types: TypeCandidate[];
    onTypesChange: (types: TypeCandidate[]) => void;
    onNext: () => void;
    onBack: () => void;
}

// Error Boundary Component
class ErrorBoundary extends Component<
    { children: ReactNode; onError: (error: Error) => void },
    { hasError: boolean; error: Error | null }
> {
    constructor(props: { children: ReactNode; onError: (error: Error) => void }) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Step3 Error Boundary caught error:', error, errorInfo);
        this.props.onError(error);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col justify-center items-center py-12 text-center">
                    <Icon icon="lucide--alert-triangle" className="size-16 text-error" />
                    <p className="mt-4 font-medium text-error">Something went wrong</p>
                    <p className="mt-1 text-sm text-base-content/70">
                        {this.state.error?.message || 'An error occurred while rendering the types'}
                    </p>
                    <button
                        className="mt-4 btn btn-ghost"
                        onClick={() => this.setState({ hasError: false, error: null })}
                    >
                        Try Again
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export function Step3_ReviewTypes({ types, onTypesChange, onNext, onBack }: Step3Props) {
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
    const [editingType, setEditingType] = useState<number | null>(null);
    const [editingField, setEditingField] = useState<'type_name' | 'description' | null>(null);
    const [editValue, setEditValue] = useState('');
    const [renderError, setRenderError] = useState<Error | null>(null);

    const toggleRow = (idx: number) => {
        const newExpanded = new Set(expandedRows);
        if (newExpanded.has(idx)) {
            newExpanded.delete(idx);
        } else {
            newExpanded.add(idx);
        }
        setExpandedRows(newExpanded);
    };

    const startEdit = (idx: number, field: 'type_name' | 'description', value: string) => {
        setEditingType(idx);
        setEditingField(field);
        setEditValue(value);
    };

    const saveEdit = () => {
        if (editingType !== null && editingField) {
            const updated = [...types];
            updated[editingType] = {
                ...updated[editingType],
                [editingField]: editValue,
            };
            onTypesChange(updated);
        }
        setEditingType(null);
        setEditingField(null);
        setEditValue('');
    };

    const cancelEdit = () => {
        setEditingType(null);
        setEditingField(null);
        setEditValue('');
    };

    const deleteType = (idx: number) => {
        const updated = types.filter((_, i) => i !== idx);
        onTypesChange(updated);
    };

    const getConfidenceColor = (confidence: number) => {
        if (confidence >= 0.8) return 'text-success';
        if (confidence >= 0.6) return 'text-warning';
        return 'text-error';
    };

    if (types.length === 0) {
        return (
            <div className="flex flex-col justify-center items-center py-12 text-center">
                <Icon icon="lucide--inbox" className="size-16 text-base-content/30" />
                <p className="mt-4 font-medium">No Types Discovered</p>
                <p className="mt-1 text-sm text-base-content/70">
                    The discovery process didn't find any entity types.
                </p>
                <button className="mt-4 btn btn-ghost" onClick={onBack}>
                    Go Back
                </button>
            </div>
        );
    }

    const content = (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h3 className="flex items-center gap-2 font-semibold">
                    <Icon icon="lucide--layers" className="size-5" />
                    Review Discovered Types
                </h3>
                <p className="mt-1 text-sm text-base-content/70">
                    Review and edit the entity types discovered from your documents. Click a row to see examples.
                </p>
            </div>

            {/* Render Error Alert */}
            {renderError && (
                <div role="alert" className="alert alert-warning">
                    <Icon icon="lucide--alert-triangle" className="size-5" />
                    <div className="flex-1">
                        <p className="font-medium">Display Error</p>
                        <p className="text-sm">{renderError.message}</p>
                    </div>
                    <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => setRenderError(null)}
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* Types Table */}
            <div className="space-y-2 overflow-x-auto">
                {types.map((type, idx) => (
                    <div key={idx} className="border border-base-300 rounded-lg">
                        {/* Main Row */}
                        <div className="flex items-center gap-3 p-4">
                            {/* Expand Button */}
                            <button
                                className="btn btn-ghost btn-sm btn-square"
                                onClick={() => toggleRow(idx)}
                            >
                                <Icon
                                    icon={
                                        expandedRows.has(idx) ? 'lucide--chevron-down' : 'lucide--chevron-right'
                                    }
                                    className="size-4"
                                />
                            </button>

                            {/* Type Name */}
                            <div className="flex-1 min-w-0">
                                {editingType === idx && editingField === 'type_name' ? (
                                    <input
                                        type="text"
                                        className="w-full input input-sm input-bordered"
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
                                        className="font-medium hover:text-primary truncate cursor-pointer"
                                        onClick={() => startEdit(idx, 'type_name', type.type_name)}
                                    >
                                        {type.type_name}
                                    </div>
                                )}
                            </div>

                            {/* Confidence */}
                            <div className={`text-sm font-medium ${getConfidenceColor(type.confidence)}`}>
                                {Math.round(type.confidence * 100)}%
                            </div>

                            {/* Frequency */}
                            <div className="text-sm text-base-content/60">
                                {type.frequency} instances
                            </div>

                            {/* Actions */}
                            <button
                                className="text-error btn btn-ghost btn-sm btn-square"
                                onClick={() => deleteType(idx)}
                                title="Delete type"
                            >
                                <Icon icon="lucide--trash-2" className="size-4" />
                            </button>
                        </div>

                        {/* Description Row (Editable) */}
                        <div className="px-4 pb-4">
                            {editingType === idx && editingField === 'description' ? (
                                <textarea
                                    className="w-full textarea textarea-bordered"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onBlur={saveEdit}
                                    rows={2}
                                    autoFocus
                                />
                            ) : (
                                <div
                                    className="hover:text-primary text-sm text-base-content/70 cursor-pointer"
                                    onClick={() => startEdit(idx, 'description', type.description)}
                                >
                                    {type.description}
                                </div>
                            )}
                        </div>

                        {/* Expanded: Examples */}
                        {expandedRows.has(idx) && type.example_instances.length > 0 && (
                            <div className="bg-base-200 px-4 py-3 border-base-300 border-t">
                                <h4 className="flex items-center gap-2 mb-2 font-medium text-sm">
                                    <Icon icon="lucide--sparkles" className="size-4" />
                                    Example Instances
                                </h4>
                                <div className="space-y-3">
                                    {type.example_instances.map((example, exIdx) => (
                                        <div key={exIdx} className="bg-base-100 p-3 border border-base-300 rounded">
                                            {typeof example === 'string' ? (
                                                <p className="text-sm text-base-content/70">{example}</p>
                                            ) : (
                                                <dl className="gap-x-3 gap-y-1 grid grid-cols-[auto_1fr] text-sm">
                                                    {Object.entries(example).map(([key, value], entryIdx) => (
                                                        <Fragment key={`${exIdx}-${key}-${entryIdx}`}>
                                                            <dt className="font-medium text-base-content/60">
                                                                {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:
                                                            </dt>
                                                            <dd className="text-base-content/80">
                                                                {typeof value === 'object' && value !== null
                                                                    ? JSON.stringify(value)
                                                                    : String(value)}
                                                            </dd>
                                                        </Fragment>
                                                    ))}
                                                </dl>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Summary */}
            <div className="flex items-center gap-2 bg-base-200 p-4 border border-base-300 rounded-lg">
                <Icon icon="lucide--info" className="size-5 text-info" />
                <span className="text-sm">
                    <span className="font-medium">{types.length}</span> entity type
                    {types.length !== 1 ? 's' : ''} will be included in your template pack.
                </span>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-between items-center gap-3 pt-4">
                <button className="btn btn-ghost" onClick={onBack}>
                    Back
                </button>
                <button className="gap-2 btn btn-primary" onClick={onNext}>
                    <Icon icon="lucide--arrow-right" className="size-4" />
                    Review Relationships
                </button>
            </div>
        </div>
    );

    return (
        <ErrorBoundary onError={setRenderError}>
            {content}
        </ErrorBoundary>
    );
}
