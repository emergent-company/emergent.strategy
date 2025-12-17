export interface GraphObjectRow {
  id: string;
  org_id?: string | null;
  project_id?: string | null;
  branch_id?: string | null;
  canonical_id: string;
  supersedes_id?: string | null;
  version: number;
  type: string;
  key?: string | null;
  status?: string | null;
  properties: any;
  labels: string[];
  schema_version?: string | null; // Template pack version at creation (e.g., "2.0.0")
  deleted_at?: string | null;
  change_summary?: any | null;
  content_hash?: string | null; // base64 encoded
  fts?: string | null; // tsvector not normally selected; optional for debug
  embedding?: any | null; // bytea/vector field for semantic search
  embedding_updated_at?: string | null; // timestamp when embedding was generated
  // Integration source tracking (docs/spec/22-clickup-integration.md section 3.3.1)
  external_source?: string | null; // Integration name (e.g., "clickup", "jira")
  external_id?: string | null; // Unique ID from source system (e.g., "9hz")
  external_url?: string | null; // Direct link to source (e.g., "https://app.clickup.com/t/9hz")
  external_parent_id?: string | null; // Parent object's external ID
  synced_at?: string | null; // Last sync timestamp
  external_updated_at?: string | null; // Last modified in source system
  created_at: string;
  // Computed fields (not stored in database)
  revision_count?: number; // Total number of versions for this object
  relationship_count?: number; // Number of relationships connected to this object
}

export interface GraphObjectDto extends GraphObjectRow {
  diff?: any;
  revision_count?: number; // Total number of versions for this object
}

export interface GraphRelationshipRow {
  id: string;
  project_id: string;
  branch_id?: string | null;
  type: string;
  src_id: string;
  dst_id: string;
  version?: number; // nullable for legacy rows until backfill
  supersedes_id?: string | null;
  canonical_id?: string;
  properties: any;
  weight?: number | null;
  valid_from?: string | null;
  valid_to?: string | null;
  deleted_at?: string | null;
  change_summary?: any | null;
  content_hash?: string | null; // base64 encoded
  created_at: string;
}

export interface GraphRelationshipDto extends GraphRelationshipRow {
  diff?: any;
}

export interface BranchRow {
  id: string;
  project_id?: string | null;
  name: string;
  parent_branch_id?: string | null;
  created_at: string;
}

export interface CreateBranchDto {
  project_id?: string | null;
  name: string;
  parent_branch_id?: string | null;
}

export interface TraversalNode {
  id: string; // object id
  depth: number;
  type: string;
  key?: string | null;
  labels: string[];
  /**
   * PHASE 3: Phase index that discovered this node.
   * Only present when edgePhases is used in the traversal request.
   * - Phase 0: Root nodes (starting points)
   * - Phase 1+: Nodes discovered in respective phases
   */
  phaseIndex?: number;
  /**
   * PHASE 3: Full paths from root nodes to this node.
   * Only present when returnPaths=true in the traversal request.
   * Each path is an array of node IDs showing the route taken.
   * Multiple paths indicate the node is reachable via different routes.
   */
  paths?: string[][];
}

export interface TraversalEdge {
  id: string; // relationship id
  type: string;
  src_id: string;
  dst_id: string;
}

export interface GraphTraversalResult {
  roots: string[];
  nodes: TraversalNode[]; // includes roots
  edges: TraversalEdge[];
  truncated: boolean; // true if any safety cap triggered
  max_depth_reached: number; // deepest depth actually explored
  // Pagination metadata (optional)
  total_nodes?: number; // total candidate nodes before slicing when pagination applied
  has_next_page?: boolean;
  has_previous_page?: boolean;
  next_cursor?: string | null;
  previous_cursor?: string | null;
  approx_position_start?: number;
  approx_position_end?: number;
  page_direction?: 'forward' | 'backward';
  // Phase 3: Query Telemetry (5a)
  query_time_ms?: number; // Query execution time in milliseconds
  result_count?: number; // Total nodes found before pagination
}
