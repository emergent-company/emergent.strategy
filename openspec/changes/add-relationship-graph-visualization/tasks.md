## 1. Setup & Dependencies

- [ ] 1.1 Install @xyflow/react package: `npm install @xyflow/react`
- [ ] 1.2 Install dagre for layout: `npm install dagre @types/dagre`
- [ ] 1.3 Verify React Flow CSS imports work with Vite

## 2. Modal Enhancements

- [ ] 2.1 Add fullscreen toggle state to ObjectDetailModal
- [ ] 2.2 Implement fullscreen toggle button (expand/collapse icon next to close button)
- [ ] 2.3 Add conditional styling for fullscreen mode (`w-[95vw] h-[95vh]` vs current size)
- [ ] 2.4 Implement tab structure using DaisyUI tabs component
- [ ] 2.5 Create Properties tab content (move existing properties display)
- [ ] 2.6 Create Relationships tab content (placeholder for graph component)
- [ ] 2.7 Create System Info tab content:
  - Move extraction metadata section
  - Move embedding status and controls
  - Add external IDs display
  - Add created_at display
- [ ] 2.8 Create Version History tab content (move existing version history)
- [ ] 2.9 Remove "View Graph" button from footer (now handled by tab)
- [ ] 2.10 Ensure tab state resets when modal closes

## 3. Core Graph Component

- [ ] 3.1 Create `RelationshipGraph/` directory under `apps/admin/src/components/organisms/`
- [ ] 3.2 Implement `graphLayoutUtils.ts` - dagre layout calculation helper
- [ ] 3.3 Implement `useGraphData.ts` hook:
  - Fetch traversal data via `/api/graph/traverse`
  - Transform API response to React Flow nodes/edges format
  - Manage expansion state for each node
- [ ] 3.4 Implement `GraphNode.tsx` - custom node component:
  - Display type icon and truncated name
  - Show expand button (+) when has unexplored relationships
  - Handle hover state for tooltip trigger
- [ ] 3.5 Implement `GraphEdge.tsx` - custom edge component:
  - Display relationship type label
  - Directional arrow
- [ ] 3.6 Implement `GraphControls.tsx`:
  - Zoom in/out buttons
  - Fit view button
  - Reset button
- [ ] 3.7 Implement `GraphMinimap.tsx` - minimap for large graph navigation
- [ ] 3.8 Implement `RelationshipGraph.tsx` - main container:
  - ReactFlow provider setup
  - Compose custom nodes, edges, controls, minimap
  - Handle node click for focus
  - Handle node double-click to open object details

## 4. Hover Tooltip

- [ ] 4.1 Implement `NodeTooltip.tsx` component:
  - Display full object name, type, status, created date
  - Display up to 3 key properties
  - Match DaisyUI card styling
- [ ] 4.2 Integrate tooltip with GraphNode hover events

## 5. Progressive Expansion

- [ ] 5.1 Add expand button handler to GraphNode
- [ ] 5.2 Implement expansion logic in useGraphData:
  - Track expanded nodes
  - Fetch additional level on expand
  - Merge new nodes/edges with existing graph
- [ ] 5.3 Animate layout transition when new nodes are added
- [ ] 5.4 Track node depth to enforce maximum expansion limit

## 6. Reset Functionality

- [ ] 6.1 Implement reset handler in useGraphData:
  - Clear expansion state
  - Re-fetch initial 2-level traversal
- [ ] 6.2 Connect reset button to handler
- [ ] 6.3 Animate return to initial view

## 7. Integration

- [ ] 7.1 Connect RelationshipGraph component to Relationships tab
- [ ] 7.2 Pass object ID and project context to graph component
- [ ] 7.3 Handle double-click navigation to open nested object details modal
- [ ] 7.4 Ensure graph resizes correctly when fullscreen toggle is used

## 8. Testing

- [ ] 8.1 Write unit tests for graphLayoutUtils
- [ ] 8.2 Write unit tests for useGraphData hook
- [ ] 8.3 Write component tests for GraphNode, GraphEdge
- [ ] 8.4 Write integration test for RelationshipGraph with mock data
- [ ] 8.5 Add Storybook story for RelationshipGraph with sample graph data
- [ ] 8.6 Write tests for ObjectDetailModal tab navigation
- [ ] 8.7 Write tests for fullscreen toggle functionality
- [ ] 8.8 Add E2E test for complete flow:
  - Open object details
  - Verify tabs render correctly
  - Switch to Relationships tab
  - Verify graph loads
  - Test expand functionality
  - Test reset functionality
  - Test zoom/pan controls
  - Test fullscreen toggle

## 9. Documentation

- [ ] 9.1 Add JSDoc comments to public components and hooks
- [ ] 9.2 Update component README if exists
