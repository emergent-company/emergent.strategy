/**
 * ObjectPreviewDrawer - Right-side push drawer for previewing object details
 *
 * This is a "push drawer" that participates in the normal layout flow (not an overlay).
 * When open, it appears on the right side and pushes the main content to the left.
 * Uses ObjectDetailContent for the shared tab content.
 */
import { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/components/atoms/Icon';
import {
  useObjectPreview,
  type ObjectPreviewTab,
} from '@/contexts/object-preview';
import { GraphViewerModal } from '@/components/organisms/GraphViewerModal';
import {
  ObjectDetailContent,
  type ObjectDetailTab,
} from '@/components/organisms/ObjectDetailModal';
import { useApi } from '@/hooks/use-api';

/** Object data structure from API */
interface GraphObjectResponse {
  id: string;
  key?: string | null;
  type: string;
  status?: string | null;
  description?: string;
  properties: Record<string, unknown>;
  labels: string[];
  external_id?: string;
  external_type?: string;
  created_at: string;
  embedding?: unknown | null;
  embedding_updated_at?: string | null;
}

/** GraphObject format expected by ObjectDetailContent */
interface GraphObject {
  id: string;
  name: string;
  type: string;
  status?: string;
  source?: string;
  updated_at: string;
  relationship_count?: number;
  properties?: Record<string, unknown>;
  embedding?: unknown | null;
  embedding_updated_at?: string | null;
}

const DRAWER_WIDTH = 550;

export interface ObjectPreviewDrawerProps {
  /** Optional className for the drawer container */
  className?: string;
}

/**
 * Push drawer component for object preview.
 * Renders inline (not as portal) and participates in flex layout.
 * Width transitions smoothly when opening/closing.
 */
export function ObjectPreviewDrawer({
  className = '',
}: ObjectPreviewDrawerProps) {
  const { state, closePreview, setActiveTab, openPreview } = useObjectPreview();
  const { isOpen, objectId, activeTab } = state;
  const { fetchJson, apiBase } = useApi();

  // Object data
  const [object, setObject] = useState<GraphObject | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Graph viewer modal
  const [showGraphModal, setShowGraphModal] = useState(false);

  // Fetch object data when objectId changes
  useEffect(() => {
    if (!objectId) {
      setObject(null);
      setError(null);
      return;
    }

    const fetchObject = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetchJson<GraphObjectResponse>(
          `${apiBase}/api/graph/objects/${objectId}`
        );

        // Transform API response to GraphObject format
        const graphObject: GraphObject = {
          id: response.id,
          name:
            (response.properties?.name as string) ||
            (response.properties?.title as string) ||
            response.key ||
            `${response.type}-${response.id.substring(0, 8)}`,
          type: response.type,
          status: response.status || undefined,
          source:
            response.external_type ||
            (response.properties?._extraction_source as string) ||
            undefined,
          updated_at: response.created_at,
          properties: response.properties,
          embedding: response.embedding,
          embedding_updated_at: response.embedding_updated_at,
        };

        setObject(graphObject);
      } catch (err) {
        console.error('Failed to fetch object:', err);
        setError(err instanceof Error ? err.message : 'Failed to load object');
        setObject(null);
      } finally {
        setLoading(false);
      }
    };

    fetchObject();
  }, [objectId, apiBase, fetchJson]);

  // Handle tab change - map ObjectPreviewTab to ObjectDetailTab
  const handleTabChange = useCallback(
    (tab: ObjectDetailTab) => {
      setActiveTab(tab as ObjectPreviewTab);
    },
    [setActiveTab]
  );

  // Handle clicking a related object
  const handleObjectClick = useCallback(
    (clickedObjectId: string) => {
      openPreview(clickedObjectId);
    },
    [openPreview]
  );

  // Handle "Open Graph" button click
  const handleOpenGraph = useCallback(() => {
    setShowGraphModal(true);
  }, []);

  // Get display name for the object
  const objectName = object?.name || 'Unknown Object';

  return (
    <>
      {/* Push Drawer - renders inline, width controlled by isOpen state */}
      <div
        className={`h-full bg-base-100 border-l border-base-300 flex flex-col overflow-hidden transition-all duration-300 ease-in-out ${className}`}
        style={{
          width: isOpen ? DRAWER_WIDTH : 0,
          minWidth: isOpen ? DRAWER_WIDTH : 0,
        }}
        role="complementary"
        aria-label="Object preview"
        aria-hidden={!isOpen}
      >
        {/* Only render content when open to avoid layout issues */}
        {isOpen && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-base-300 bg-base-100 shrink-0">
              {loading ? (
                <div className="flex items-center gap-3">
                  <div className="skeleton w-8 h-8 rounded" />
                  <div>
                    <div className="skeleton h-5 w-32 mb-1" />
                    <div className="skeleton h-4 w-20" />
                  </div>
                </div>
              ) : object ? (
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex items-center justify-center size-8 rounded bg-primary/10 text-primary shrink-0">
                    <Icon icon="lucide--box" className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <h2
                      className="font-semibold text-base truncate"
                      title={objectName}
                    >
                      {objectName}
                    </h2>
                    <span className="badge badge-primary badge-sm">
                      {object.type}
                    </span>
                  </div>
                </div>
              ) : error ? (
                <div className="text-error text-sm">Error loading object</div>
              ) : (
                <div className="text-base-content/60">No object selected</div>
              )}

              <button
                type="button"
                className="btn btn-sm btn-circle btn-ghost shrink-0"
                onClick={closePreview}
                aria-label="Close preview"
              >
                <Icon icon="lucide--x" className="size-4" />
              </button>
            </div>

            {/* Tab Navigation */}
            <div className="px-4 shrink-0 border-b border-base-300">
              <div role="tablist" className="tabs tabs-border tabs-sm">
                {(
                  ['properties', 'relationships', 'system', 'history'] as const
                ).map((tab) => (
                  <button
                    key={tab}
                    role="tab"
                    className={`tab gap-1.5 ${
                      activeTab === tab ? 'tab-active' : ''
                    }`}
                    onClick={() => handleTabChange(tab)}
                  >
                    <Icon
                      icon={
                        tab === 'properties'
                          ? 'lucide--list'
                          : tab === 'relationships'
                          ? 'lucide--git-branch'
                          : tab === 'system'
                          ? 'lucide--info'
                          : 'lucide--history'
                      }
                      className="size-3.5"
                    />
                    <span className="capitalize">{tab}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto">
              {error ? (
                <div className="flex flex-col items-center justify-center py-8 text-error px-4">
                  <Icon
                    icon="lucide--alert-circle"
                    className="size-10 mb-2 opacity-60"
                  />
                  <p className="text-sm text-center">{error}</p>
                </div>
              ) : (
                <ObjectDetailContent
                  object={object}
                  activeTab={activeTab as ObjectDetailTab}
                  onTabChange={handleTabChange}
                  onObjectClick={handleObjectClick}
                  onOpenGraph={handleOpenGraph}
                  loading={loading}
                  variant={{
                    showInlineGraph: false, // Drawer shows "Open Graph" button instead
                    showEmbeddingControls: false, // Keep drawer simple
                    isFullscreen: false,
                    showMinimap: false,
                    compact: true, // Tighter spacing for drawer
                  }}
                />
              )}
            </div>
          </>
        )}
      </div>

      {/* Graph Viewer Modal - opens when "Open Graph" is clicked */}
      {object && (
        <GraphViewerModal
          isOpen={showGraphModal}
          objectId={object.id}
          objectName={objectName}
          onClose={() => setShowGraphModal(false)}
        />
      )}
    </>
  );
}
