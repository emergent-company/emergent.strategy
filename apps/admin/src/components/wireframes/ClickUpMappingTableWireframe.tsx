import React from 'react';

import { Spinner } from '@/components/atoms/Spinner';

export interface ClickUpMappingTableWireframeProps {
  state?: 'default' | 'no-space' | 'syncing';
  rows?: number;
}

export const ClickUpMappingTableWireframe: React.FC<
  ClickUpMappingTableWireframeProps
> = ({ state = 'default', rows = 5 }) => {
  if (state === 'no-space') {
    return (
      <div className="flex flex-col justify-center items-center gap-4 bg-base-100 p-12 border border-base-300 rounded text-center">
        <div className="bg-base-300 rounded w-12 h-12" />
        <div className="space-y-2 text-sm text-base-content/70">
          <p>No ClickUp space connected.</p>
          <p className="text-base-content/50">
            Connect a space to configure mapping.
          </p>
        </div>
        <div className="bg-base-300 rounded w-40 h-9" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 bg-base-200/50 p-3 border border-base-300 rounded">
        <div className="bg-base-300 rounded w-64 h-8" />
        <div className="bg-base-300 rounded w-48 h-8" />
        <div className="flex items-center gap-2 ml-auto">
          <div className="bg-base-300 rounded w-28 h-8" />
          <div className="bg-base-300 rounded w-24 h-8" />
        </div>
      </div>
      <div className="border border-base-300 rounded overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr className="text-xs text-base-content/60 uppercase">
              <th>External Type</th>
              <th>Internal Type</th>
              <th>Rule Source</th>
              <th>Overrides</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, i) => (
              <tr
                key={i}
                className={
                  state === 'syncing' ? 'animate-pulse opacity-70' : ''
                }
              >
                <td>
                  <div className="bg-base-300 rounded w-32 h-4" />
                </td>
                <td>
                  <div className="bg-base-300 rounded w-40 h-4" />
                </td>
                <td>
                  <div className="bg-base-300 rounded w-24 h-4" />
                </td>
                <td>
                  <div className="bg-base-300 rounded w-16 h-4" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {state === 'syncing' && (
        <div className="flex items-center gap-2 text-xs text-base-content/60">
          <Spinner size="xs" />
          <span>Sync in progress…</span>
        </div>
      )}
    </div>
  );
};

export default ClickUpMappingTableWireframe;
