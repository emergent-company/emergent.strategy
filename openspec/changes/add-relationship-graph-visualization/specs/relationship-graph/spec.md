## ADDED Requirements

### Requirement: Object Detail Modal Tabs

The system SHALL organize object detail content into logical tabs for improved navigation and clarity.

#### Scenario: Tab structure display

- **WHEN** user opens the object detail modal
- **THEN** the modal SHALL display four tabs: Properties, Relationships, System Info, Version History
- **AND** the Properties tab SHALL be selected by default

#### Scenario: Properties tab content

- **WHEN** user views the Properties tab
- **THEN** the tab SHALL display object properties (excluding extraction metadata)
- **AND** the tab SHALL display object status and labels

#### Scenario: Relationships tab content

- **WHEN** user clicks the Relationships tab
- **THEN** the tab SHALL display the interactive relationship graph browser
- **AND** the graph SHALL load with 2 levels of relationships from the current object

#### Scenario: System Info tab content

- **WHEN** user clicks the System Info tab
- **THEN** the tab SHALL display extraction metadata (confidence, source documents, chunk references)
- **AND** the tab SHALL display embedding status and generation controls
- **AND** the tab SHALL display external IDs and created date

#### Scenario: Version History tab content

- **WHEN** user clicks the Version History tab
- **THEN** the tab SHALL display the version timeline for the object

### Requirement: Modal Fullscreen Toggle

The system SHALL allow users to expand the object detail modal to fullscreen for better viewing.

#### Scenario: Expand to fullscreen

- **WHEN** user clicks the fullscreen toggle button (expand icon next to close button)
- **THEN** the modal SHALL expand to fill the viewport (approximately 95% width and height)
- **AND** the toggle icon SHALL change to a collapse icon

#### Scenario: Collapse from fullscreen

- **WHEN** user clicks the fullscreen toggle button while in fullscreen mode
- **THEN** the modal SHALL return to its default size
- **AND** the toggle icon SHALL change back to an expand icon

#### Scenario: Fullscreen persists across tabs

- **WHEN** user is in fullscreen mode
- **AND** switches between tabs
- **THEN** the fullscreen mode SHALL remain active

### Requirement: Graph Visualization Display

The system SHALL display an interactive relationship graph visualization for any graph object, showing connected nodes and edges in a 2D canvas.

#### Scenario: Default graph view on load

- **WHEN** user opens the Relationships tab for an object
- **THEN** the graph SHALL display the focused object at the center
- **AND** the graph SHALL show 2 levels of relationships from the focused object
- **AND** each node SHALL display the object type icon and name

#### Scenario: Node label display

- **WHEN** a node is rendered in the graph
- **THEN** the node SHALL display the object type as an icon or badge
- **AND** the node SHALL display the object name (truncated to 20 characters if longer)

#### Scenario: Edge label display

- **WHEN** an edge is rendered between two nodes
- **THEN** the edge SHALL display the relationship type as a label
- **AND** the edge SHALL display a directional arrow indicating the relationship direction

### Requirement: Node Hover Details

The system SHALL display detailed object information when the user hovers over a graph node.

#### Scenario: Hover shows object details

- **WHEN** user hovers over a node in the graph
- **THEN** the system SHALL display a tooltip card showing:
  - Full object name
  - Object type
  - Status (if applicable)
  - Created date
  - Key properties (up to 3)

#### Scenario: Hover tooltip dismissal

- **WHEN** user moves the cursor away from a node
- **THEN** the tooltip card SHALL be dismissed

### Requirement: Progressive Graph Expansion

The system SHALL allow users to progressively expand the graph to explore deeper relationships.

#### Scenario: Expand node with unexplored relationships

- **WHEN** user clicks the expand button (+) on a node that has unexplored relationships
- **THEN** the system SHALL fetch the next level of relationships for that node
- **AND** the system SHALL add the new nodes and edges to the existing graph
- **AND** the layout SHALL adjust to accommodate new nodes

#### Scenario: Expand indicator visibility

- **WHEN** a node has unexplored outgoing or incoming relationships
- **THEN** the node SHALL display an expand indicator (+) button

#### Scenario: Maximum expansion depth

- **WHEN** user has expanded nodes to reach 5 levels of depth
- **THEN** the system SHALL allow further expansion up to the API limit (8 levels)

### Requirement: Graph Navigation Controls

The system SHALL provide navigation controls for exploring the graph canvas.

#### Scenario: Zoom in

- **WHEN** user clicks the zoom in control or uses scroll wheel up
- **THEN** the graph SHALL zoom in to show more detail

#### Scenario: Zoom out

- **WHEN** user clicks the zoom out control or uses scroll wheel down
- **THEN** the graph SHALL zoom out to show more of the graph

#### Scenario: Pan navigation

- **WHEN** user clicks and drags on the graph canvas
- **THEN** the viewport SHALL pan in the direction of the drag

#### Scenario: Fit view

- **WHEN** user has zoomed or panned the graph
- **AND** clicks a "fit view" control
- **THEN** the graph SHALL adjust zoom and position to fit all visible nodes in the viewport

### Requirement: Focus on Node

The system SHALL allow users to focus on a specific node, centering it in the viewport.

#### Scenario: Click to focus

- **WHEN** user clicks on a node in the graph
- **THEN** the graph SHALL animate to center that node in the viewport

#### Scenario: Focus preserves zoom level

- **WHEN** user clicks to focus on a node
- **THEN** the current zoom level SHALL be preserved unless the node is outside the visible area

### Requirement: Reset Graph View

The system SHALL allow users to reset the graph to its initial state.

#### Scenario: Reset button returns to default view

- **WHEN** user clicks the "Reset" button
- **THEN** the graph SHALL collapse all expanded nodes beyond the initial 2 levels
- **AND** the graph SHALL re-center on the original focused object
- **AND** the zoom level SHALL return to the default fit view

### Requirement: Large Graph Handling

The system SHALL provide navigation aids when displaying large graphs with many nodes.

#### Scenario: Minimap display for large graphs

- **WHEN** the graph contains more than 10 nodes
- **THEN** the system SHALL display a minimap showing an overview of the entire graph
- **AND** the minimap SHALL highlight the current viewport area

#### Scenario: Minimap navigation

- **WHEN** user clicks on a location in the minimap
- **THEN** the viewport SHALL navigate to center on that location

### Requirement: Graph Node Navigation

The system SHALL allow users to navigate to object details from graph nodes.

#### Scenario: Navigate to object details from graph

- **WHEN** user double-clicks on a node in the graph
- **THEN** the system SHALL open the object details view for that node
