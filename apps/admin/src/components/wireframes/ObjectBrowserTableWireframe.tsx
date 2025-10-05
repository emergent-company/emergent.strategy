import React from 'react';

export interface ObjectBrowserTableWireframeProps {
    state?: 'default' | 'loading' | 'empty' | 'error' | 'bulk';
    rows?: number;
}

const skeletonRow = (key: React.Key) => (
    <tr key={key} className="opacity-70 animate-pulse">
        <td className="py-2"><div className="bg-base-300 rounded w-4 h-4" /></td>
        <td><div className="bg-base-300 rounded w-40 h-4" /></td>
        <td><div className="bg-base-300 rounded w-24 h-4" /></td>
        <td><div className="bg-base-300 rounded w-20 h-4" /></td>
        <td><div className="bg-base-300 rounded w-16 h-4" /></td>
        <td><div className="bg-base-300 rounded w-10 h-4" /></td>
    </tr>
);

export const ObjectBrowserTableWireframe: React.FC<ObjectBrowserTableWireframeProps> = ({ state = 'default', rows = 5 }) => {
    const renderBody = () => {
        if (state === 'loading') {
            return Array.from({ length: rows }).map((_, i) => skeletonRow(i));
        }
        if (state === 'empty') {
            return (
                <tr>
                    <td colSpan={6} className="py-10 text-sm text-base-content/70 text-center">
                        No objects match current filters.
                    </td>
                </tr>
            );
        }
        if (state === 'error') {
            return (
                <tr>
                    <td colSpan={6} className="py-10 text-error text-sm text-center">
                        Failed to load objects. Retry later.
                    </td>
                </tr>
            );
        }
        return Array.from({ length: rows }).map((_, i) => (
            <tr key={i} className={state === 'bulk' ? 'bg-base-200' : ''}>
                <td><input type="checkbox" className="checkbox checkbox-sm" /></td>
                <td>
                    <div className="bg-base-300 rounded w-40 h-4" />
                </td>
                <td><div className="bg-base-300 rounded w-24 h-4" /></td>
                <td><div className="bg-base-300 rounded w-20 h-4" /></td>
                <td><div className="bg-base-300 rounded w-16 h-4" /></td>
                <td><div className="bg-base-300 rounded w-10 h-4" /></td>
            </tr>
        ));
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 bg-base-200/50 p-3 border border-base-300 rounded">
                <div className="flex items-center gap-2">
                    <div className="bg-base-300 rounded w-64 h-8" />
                    <div className="bg-base-300 rounded w-40 h-8" />
                    <div className="bg-base-300 rounded w-24 h-8" />
                </div>
                <div className="flex items-center gap-2 ml-auto">
                    <div className="bg-base-300 rounded w-24 h-8" />
                    <div className="bg-base-300 rounded w-24 h-8" />
                </div>
            </div>
            {state === 'bulk' && (
                <div className="bg-base-100 p-2 border border-base-300 border-dashed rounded text-xs text-base-content/70">
                    3 selected – Bulk actions: <span className="underline">Delete</span> | <span className="underline">Export</span>
                </div>
            )}
            <div className="border border-base-300 rounded overflow-x-auto">
                <table className="table table-sm">
                    <thead>
                        <tr className="text-xs text-base-content/60 uppercase">
                            <th className="w-8" />
                            <th>Name</th>
                            <th>Type</th>
                            <th>Source</th>
                            <th>Updated</th>
                            <th>Rel</th>
                        </tr>
                    </thead>
                    <tbody>{renderBody()}</tbody>
                </table>
            </div>
        </div>
    );
};

export default ObjectBrowserTableWireframe;
