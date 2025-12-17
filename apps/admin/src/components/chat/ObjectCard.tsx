import React, { useState, useEffect } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { useApi } from '@/hooks/use-api';

interface ObjectCardProps {
  objectKey: string;
  name?: string;
  type?: string;
  description?: string;
  /** Called when user clicks the card. Passes the object ID (UUID) if available, otherwise objectKey */
  onClick?: (objectId: string) => void;
}

interface GraphObject {
  id: string;
  key: string;
  type: string;
  properties: Record<string, unknown>;
  labels?: string[];
}

// Simple in-memory cache to prevent re-fetching
const objectCache = new Map<string, GraphObject | null>();
const activeRequests = new Map<string, Promise<GraphObject | null>>();

// Get icon for object type
function getTypeIcon(type: string): string {
  const typeIcons: Record<string, string> = {
    person: 'lucide--user',
    place: 'lucide--map-pin',
    location: 'lucide--map-pin',
    event: 'lucide--calendar',
    organization: 'lucide--building-2',
    document: 'lucide--file-text',
    concept: 'lucide--lightbulb',
    artifact: 'lucide--package',
    default: 'lucide--box',
  };
  return typeIcons[type.toLowerCase()] || typeIcons.default;
}

/**
 * ObjectCard - A compact card component for displaying graph object references
 *
 * Features:
 * - Compact design (~60px height) with icon, name, and type badge
 * - Fetches object data from backend
 * - Clickable with onClick callback passing objectId
 * - Caches results to prevent blinking/refetching
 * - Memoized to prevent unnecessary re-renders
 */
function ObjectCardBase({
  objectKey,
  name: initialName,
  type: initialType,
  onClick,
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
    (data?.properties?.name as string) ||
    data?.key ||
    initialName ||
    (isUuid ? 'Unknown Object' : objectKey);

  const typeToShow = data?.type || initialType || 'Object';

  const idToShow = data?.id || objectKey;

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

  const handleClick = () => {
    if (onClick) {
      // Pass the actual object ID (UUID) if we have it, otherwise the key
      onClick(data?.id || objectKey);
    }
  };

  if (loading) {
    return (
      <div className="inline-flex items-center gap-2 bg-base-200 px-3 py-2 rounded-lg border border-base-300 animate-pulse my-1">
        <div className="size-5 bg-base-300 rounded" />
        <div className="h-4 bg-base-300 rounded w-24" />
        <div className="h-4 bg-base-300 rounded w-12" />
      </div>
    );
  }

  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 bg-base-200 hover:bg-base-300 px-3 py-2 rounded-lg border border-base-300 hover:border-primary/30 transition-all duration-200 cursor-pointer my-1 text-left group"
      title={`Click to view details\nID: ${idToShow}`}
      onClick={handleClick}
    >
      {/* Type Icon */}
      <Icon
        icon={getTypeIcon(typeToShow)}
        className="size-5 text-primary shrink-0"
      />

      {/* Name */}
      <span className="font-medium text-sm truncate max-w-[200px] group-hover:text-primary transition-colors">
        {nameToShow}
      </span>

      {/* Type Badge */}
      <span className="badge badge-neutral badge-xs uppercase tracking-wider font-semibold shrink-0">
        {typeToShow}
      </span>

      {/* Arrow indicator */}
      <Icon
        icon="lucide--chevron-right"
        className="size-4 text-base-content/40 group-hover:text-primary/60 shrink-0 transition-colors"
      />
    </button>
  );
}

export const ObjectCard = React.memo(ObjectCardBase);
