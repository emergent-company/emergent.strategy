# Design: Relationship Graph Visualization & Modal Enhancements

## Context

The object details view (`ObjectDetailModal`) currently has a disabled "View Graph" button. Relationships are displayed as flat lists, which makes it difficult to understand complex relationship networks. The backend already provides a robust graph traversal API (`/api/graph/traverse`) that supports depth-based queries, direction filtering, and pagination.

Additionally, the modal is fairly small (~max-w-4xl, max-h-[90vh]) and displays all content in a single scrollable view, making it cramped when viewing objects with many properties and relationships.

**Stakeholders:**

- End users who need to explore knowledge graph relationships
- Developers maintaining the admin frontend

**Constraints:**

- Must integrate with existing React 19 + Vite + Tailwind/DaisyUI stack
- Must work with existing graph traversal API (no backend changes required)
- Should handle potentially large graphs (100+ nodes) without performance degradation
- Must be accessible and work with keyboard navigation
- Tab organization must use DaisyUI tab components for consistency

## Goals / Non-Goals

**Goals:**

- Provide interactive graph visualization with zoom, pan, and focus capabilities
- Support progressive exploration (expand nodes on demand)
- Show 2 levels of relationships by default
- Display object details on hover
- Handle large graphs gracefully with zoom controls
- Add fullscreen toggle for better viewing experience
- Reorganize modal content into logical tabs
- Integrate seamlessly with existing ObjectDetailModal

**Non-Goals:**

- Editing relationships from the graph view (read-only for initial implementation)
- 3D visualization (2D is sufficient for initial implementation)
- Graph analytics or metrics display
- Exporting graph as image
- Changing the modal to a separate page route

## Decisions

### Library Selection: @xyflow/react (React Flow)

**Decision:** Use @xyflow/react (React Flow v12) for graph visualization.

**Why React Flow over alternatives:**

| Library           | Pros                                                                                                                                                                                                                    | Cons                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **@xyflow/react** | - Purpose-built for React<br>- Excellent TypeScript support<br>- Built-in zoom, pan, minimap<br>- Custom node/edge support<br>- Active maintenance (26k+ GitHub stars)<br>- Used by Dify, DataHub, many production apps | - Primarily for node-based editors (but works for visualization)<br>- Requires layout algorithm for auto-positioning |
| react-force-graph | - Physics-based auto-layout<br>- Good for network visualization                                                                                                                                                         | - 2D/3D variants are separate packages<br>- Less React-idiomatic<br>- Fewer built-in controls                        |
| cytoscape         | - Very powerful graph library<br>- Many layout algorithms                                                                                                                                                               | - Not React-native (wrapper needed)<br>- Heavier learning curve<br>- jQuery-era API patterns                         |
| d3-force          | - Ultimate flexibility                                                                                                                                                                                                  | - Low-level, significant implementation effort<br>- No React integration                                             |

**React Flow advantages for our use case:**

1. Built-in `fitView`, `zoomTo`, `setCenter` for our focus requirements
2. Custom nodes allow rich hover cards matching DaisyUI styling
3. `useReactFlow` hook integrates with React patterns
4. Minimap component for large graph navigation
5. `getConnectedEdges` and node selection built-in

### Layout Algorithm: dagre

**Decision:** Use dagre (hierarchical/DAG layout) for automatic node positioning.

**Rationale:**

- Knowledge graph relationships often have hierarchical structure (parent-child, dependencies)
- dagre provides clean left-to-right or top-to-bottom layouts
- Works well with React Flow (documented integration pattern)
- Lightweight (40kb) vs ELK (larger, more complex)

**Alternative considered:** ELK - More powerful but overkill for initial implementation.

### Component Architecture

```
RelationshipGraph/
├── RelationshipGraph.tsx       # Main container with ReactFlow
├── GraphNode.tsx               # Custom node component with hover
├── GraphEdge.tsx               # Custom edge with relationship type label
├── GraphControls.tsx           # Zoom controls + Reset button
├── GraphMinimap.tsx            # Minimap for large graphs
├── useGraphData.ts             # Hook for traversal API + state
└── graphLayoutUtils.ts         # dagre layout calculations
```

### Data Flow

1. **Initial Load:** Fetch 2 levels via `/api/graph/traverse` with `max_depth: 2`
2. **On Expand:** Fetch additional level from clicked node via same API with `root_ids: [nodeId]`, `max_depth: 1`
3. **State Management:** Local component state (no global store needed)
4. **Focus Behavior:** Use `fitView({ nodes: [{ id }] })` to center on clicked node

### Node Display

**Default state (collapsed):**

- Type icon (from existing iconography)
- Object name (truncated to ~20 chars)
- Small indicator if expandable (has more relationships)

**Hover state:**

- Tooltip card showing:
  - Full name
  - Type
  - Status badge
  - Created date
  - Key properties (first 3)

### Edge Display

- Directed arrows showing relationship direction
- Edge label showing relationship type (e.g., "depends_on", "implements")
- Subtle curve to avoid overlap

## Risks / Trade-offs

| Risk                                | Mitigation                                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Large graphs may overwhelm the view | - Default to 2 levels<br>- Minimap for navigation<br>- Zoom controls<br>- Consider node limit (50-100 visible) with "show more"      |
| Layout jitter on expansion          | - Animate layout transitions<br>- Preserve existing node positions when adding new nodes                                             |
| Performance with 100+ nodes         | - React Flow is optimized for this<br>- Use `nodesDraggable={false}` if needed<br>- Virtualization built into React Flow             |
| Mobile/touch support                | - React Flow has touch support<br>- May need larger touch targets<br>- Consider responsive breakpoint to hide graph on small screens |

## Migration Plan

Not applicable - this is a new feature, not modifying existing functionality.

## Modal Tab Structure

### Tab Organization

| Tab                      | Content                                                         | Notes                                                           |
| ------------------------ | --------------------------------------------------------------- | --------------------------------------------------------------- |
| **Properties** (default) | Regular object properties, status, labels                       | Excludes relationship properties and extraction metadata        |
| **Relationships**        | Interactive graph browser                                       | Full relationship graph with expand/collapse, zoom, focus       |
| **System Info**          | Extraction metadata, embedding status, external IDs, created_at | Combines current extraction metadata section with system fields |
| **Version History**      | Version timeline, diff view                                     | Existing version history functionality                          |

### Fullscreen Toggle

- Icon button (expand/collapse) placed next to close button in header
- Normal mode: `max-w-4xl max-h-[90vh]` (current)
- Fullscreen mode: `w-[95vw] h-[95vh]` or similar near-fullscreen size
- Persists across tab switches within same modal session
- Especially useful for Relationships tab to view large graphs

### Tab Implementation

Use DaisyUI tabs with `tabs-lifted` or `tabs-boxed` style:

```tsx
<div role="tablist" className="tabs tabs-lifted">
  <input type="radio" name="object_tabs" role="tab" className="tab" aria-label="Properties" defaultChecked />
  <div role="tabpanel" className="tab-content ...">Properties content</div>

  <input type="radio" name="object_tabs" role="tab" className="tab" aria-label="Relationships" />
  <div role="tabpanel" className="tab-content ...">Graph browser</div>

  <!-- ... more tabs -->
</div>
```

## Open Questions

1. **Q: Should the graph open in a modal or as a page view?**
   A: Initial implementation opens in the existing ObjectDetailModal as a tab/panel. Can expand to full-page view later if needed.

2. **Q: What's the maximum depth users should be able to expand to?**
   A: Allow up to 5 levels total, matching API's `max_depth` limit of 8. Each expand adds 1 level.

3. **Q: Should we cache traversal results?**
   A: Start without caching. If performance issues arise, implement React Query caching keyed by root ID + depth.
