export interface GraphObjectRow {
    id: string;
    org_id?: string | null;
    project_id?: string | null;
    canonical_id: string;
    supersedes_id?: string | null;
    version: number;
    type: string;
    key?: string | null;
    properties: any;
    labels: string[];
    deleted_at?: string | null;
    created_at: string;
}

export interface GraphObjectDto extends GraphObjectRow {
    diff?: any;
}

export interface GraphRelationshipRow {
    id: string;
    org_id: string;
    project_id: string;
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
    created_at: string;
}

export interface GraphRelationshipDto extends GraphRelationshipRow { diff?: any; }

export interface TraversalNode {
    id: string; // object id
    depth: number;
    type: string;
    key?: string | null;
    labels: string[];
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
}


