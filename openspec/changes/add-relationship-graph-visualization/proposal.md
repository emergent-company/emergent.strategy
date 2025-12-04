# Change: Add Interactive Relationship Graph Visualization

## Why

The current object details view displays relationships as flat lists, making it difficult to understand complex relationship networks between objects. Users need to visualize and navigate object relationships in an intuitive, interactive graph format that shows connection depth and allows progressive exploration of the knowledge graph.

Additionally, the current modal is fairly small and cramped, with all information displayed in a single scrollable view. A larger fullscreen option and tabbed organization would improve usability.

## What Changes

### Graph Visualization

- Add interactive relationship graph visualization component to object details view
- Display 2 levels of relationships from the focused object by default
- Enable progressive expansion via "+" buttons on nodes to explore deeper relationships
- Implement "Reset" button to return to default 2-level view
- Add zoom controls and pan navigation for handling large graphs
- Support click-to-focus behavior that centers the selected node
- Show object details on hover (type, name, basic properties)
- Display node labels showing type and name by default
- Integrate with existing `/api/graph/traverse` endpoint for depth-based relationship fetching

### Modal Enhancements

- Add fullscreen toggle button (expand icon next to close button)
- Reorganize content into tabs:
  - **Properties** (1st tab, default) - Object properties only
  - **Relationships** (2nd tab) - Interactive relationship graph browser
  - **System Info** (3rd tab) - Extraction metadata, embedding status, external IDs, created date
  - **Version History** (4th tab) - Version timeline and history
- Fullscreen mode expands modal to fill viewport for better graph visualization

## Impact

- Affected specs: New `relationship-graph` capability (no existing specs modified)
- Affected code:
  - `apps/admin/src/components/organisms/ObjectDetailModal/ObjectDetailModal.tsx` - Major refactor: add tabs, fullscreen toggle, enable "View Graph"
  - New component: `apps/admin/src/components/organisms/RelationshipGraph/RelationshipGraph.tsx`
  - New hooks for graph data fetching and state management
  - Package dependencies: @xyflow/react (React Flow library)
