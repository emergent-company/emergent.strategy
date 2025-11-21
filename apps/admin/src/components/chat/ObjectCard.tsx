import React, { useState, useEffect } from 'react';
import { useApi } from '@/hooks/use-api';

interface ObjectCardProps {
  objectKey: string;
  name?: string;
  type?: string;
  description?: string;
}

interface GraphObject {
  id: string;
  key: string;
  type: string;
  properties: Record<string, any>;
  labels?: string[];
}

// Simple in-memory cache to prevent re-fetching
const objectCache = new Map<string, GraphObject | null>();
const activeRequests = new Map<string, Promise<GraphObject | null>>();

/**
 * ObjectCard - A card component for displaying graph object references
 *
 * Features:
 * - Distinct styling from UrlBadge (secondary color scheme)
 * - Displays object key, name, and optional type/description
 * - Fetches object data from backend
 * - Clickable (currently just visual)
 * - Caches results to prevent blinking/refetching
 * - Memoized to prevent unnecessary re-renders
 */
function ObjectCardBase({
  objectKey,
  name: initialName,
  type: initialType,
  description: initialDescription,
}: ObjectCardProps) {
  const { fetchJson, apiBase } = useApi();

  // Initialize from cache if available
  const [data, setData] = useState<GraphObject | null>(
    () => objectCache.get(objectKey) || null
  );
  const [loading, setLoading] = useState(() => !objectCache.has(objectKey));

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      objectKey
    );

  // Correct Data Mapping
  const nameToShow =
    data?.properties?.name ||
    data?.key ||
    initialName ||
    (isUuid ? 'Unknown Object' : objectKey);

  const typeToShow = data?.type || initialType || 'Object';

  const descriptionToShow = data?.properties?.description || initialDescription;

  const tagsToShow = data?.labels || [];

  const idToShow = data?.id || objectKey;
  const keyToShow = data?.key || objectKey;

  useEffect(() => {
    // If we have data in cache, ensure state matches and stop
    if (objectCache.has(objectKey)) {
      const cached = objectCache.get(objectKey);
      if (data !== cached) {
        setData(cached || null);
      }
      setLoading(false);
      return;
    }

    let mounted = true;

    async function loadObject() {
      setLoading(true);
      try {
        let promise = activeRequests.get(objectKey);

        if (!promise) {
          promise = (async () => {
            if (isUuid) {
              return await fetchJson<GraphObject>(
                `${apiBase}/api/graph/objects/${objectKey}`
              );
            } else {
              // The API returns { items: [...] } for search
              const response = await fetchJson<{ items: GraphObject[] }>(
                `${apiBase}/api/graph/objects/search?key=${encodeURIComponent(
                  objectKey
                )}`
              );
              if (response.items && response.items.length > 0) {
                return response.items[0];
              }
              return null;
            }
          })();

          activeRequests.set(objectKey, promise);
        }

        const result = await promise;

        // Update cache if we got a result
        if (result) {
          objectCache.set(objectKey, result);
        }

        // Remove from active requests once done
        activeRequests.delete(objectKey);

        if (mounted) {
          if (result) {
            setData(result);
          } else {
            // Not found, keep initial props
            console.warn(`Object with key ${objectKey} not found`);
          }
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to fetch object card data', err);
        activeRequests.delete(objectKey);
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadObject();

    return () => {
      mounted = false;
    };
  }, [objectKey, fetchJson, apiBase, isUuid, data]);

  if (loading) {
    return (
      <div className="card bg-base-200 w-full max-w-md shadow-sm animate-pulse p-4 rounded-box my-2">
        <div className="flex justify-between items-center mb-2">
          <div className="h-5 bg-base-300 rounded w-1/2"></div>
          <div className="h-5 bg-base-300 rounded w-16"></div>
        </div>
        <div className="h-4 bg-base-300 rounded w-3/4"></div>
      </div>
    );
  }

  return (
    <div
      className="card bg-base-200 text-base-content shadow-sm hover:shadow-md transition-shadow duration-200 border border-base-300 rounded-box cursor-pointer w-full max-w-md my-2"
      title={`ID: ${idToShow}\nKey: ${keyToShow}`}
      onClick={() => {
        // Eventually this could open a drawer or navigate
        console.log('Clicked object', objectKey);
      }}
    >
      <div className="card-body p-4 gap-2">
        {/* Top Row: Name and Type */}
        <div className="flex items-start justify-between gap-3">
          <h3 className="card-title text-base font-bold leading-tight break-words">
            {nameToShow}
          </h3>
          <div className="badge badge-neutral badge-sm uppercase tracking-wider font-bold shrink-0">
            {typeToShow}
          </div>
        </div>

        {/* Middle: Description */}
        {descriptionToShow && (
          <p className="text-sm text-base-content/70 line-clamp-2 break-words">
            {descriptionToShow}
          </p>
        )}

        {/* Bottom: Tags */}
        {tagsToShow.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {tagsToShow.map((tag, idx) => (
              <span
                key={`${tag}-${idx}`}
                className="badge badge-ghost badge-xs border-base-content/10"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export const ObjectCard = React.memo(ObjectCardBase);
