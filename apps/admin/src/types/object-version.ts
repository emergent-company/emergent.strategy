/**
 * Object version from the /graph/objects/:id/history endpoint
 */
export interface ObjectVersion {
    id: string;
    version: number;
    supersedes_id?: string;
    canonical_id: string;
    type: string;
    key?: string;
    properties: Record<string, unknown>;
    labels: string[];
    change_summary?: {
        fields?: string[];      // Which fields changed
        reason?: string;        // Why it changed
        added?: string[];       // New fields
        removed?: string[];     // Deleted fields
        modified?: string[];    // Changed fields
    };
    created_at: string;
    deleted_at?: string;
}

/**
 * Response from /graph/objects/:id/history
 */
export interface ObjectHistoryResponse {
    items: ObjectVersion[];
    next_cursor?: string;
}
