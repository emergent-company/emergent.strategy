import React from 'react';

interface ObjectCardProps {
  objectKey: string;
  name: string;
  type?: string;
  description?: string;
}

/**
 * ObjectCard - A card component for displaying graph object references
 *
 * Features:
 * - Distinct styling from UrlBadge (secondary color scheme)
 * - Displays object key, name, and optional type/description
 * - Clickable (currently just visual)
 */
export function ObjectCard({
  objectKey,
  name,
  type,
  description,
}: ObjectCardProps) {
  return (
    <span
      className="inline-flex flex-col gap-0.5 px-3 py-2 bg-secondary/5 hover:bg-secondary/10 border border-secondary/20 rounded-md transition-colors no-underline align-middle my-1 mx-1 cursor-pointer"
      title={description || `${type || 'Object'} ${objectKey}`}
    >
      <span className="flex items-center gap-2">
        {type && (
          <span className="text-[10px] font-bold uppercase text-secondary/80 tracking-wider bg-secondary/10 px-1 rounded">
            {type}
          </span>
        )}
        <span className="text-[10px] font-mono text-base-content/50">
          {objectKey}
        </span>
      </span>

      <span className="font-semibold text-sm text-secondary-content leading-tight">
        {name}
      </span>

      {description && (
        <span className="text-xs text-base-content/60 line-clamp-1 mt-0.5">
          {description}
        </span>
      )}
    </span>
  );
}
