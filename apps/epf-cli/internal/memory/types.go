package memory

import "time"

// Object represents a graph object (entity) in emergent.memory.
type Object struct {
	ID         string         `json:"id"`
	Type       string         `json:"type"`
	Key        string         `json:"key,omitempty"`
	Status     string         `json:"status,omitempty"`
	Labels     []string       `json:"labels,omitempty"`
	Properties map[string]any `json:"properties,omitempty"`
	Version    int            `json:"version,omitempty"`
	BranchID   string         `json:"branchId,omitempty"`
	CreatedAt  time.Time      `json:"createdAt,omitempty"`
	UpdatedAt  time.Time      `json:"updatedAt,omitempty"`
}

// Relationship represents a directed edge between two graph objects.
type Relationship struct {
	ID         string         `json:"id"`
	Type       string         `json:"type"`
	FromID     string         `json:"src_id"`
	ToID       string         `json:"dst_id"`
	Properties map[string]any `json:"properties,omitempty"`
	Version    int            `json:"version,omitempty"`
	CreatedAt  time.Time      `json:"createdAt,omitempty"`
	UpdatedAt  time.Time      `json:"updatedAt,omitempty"`
}

// Edge represents one side of a relationship as seen from a specific object.
type Edge struct {
	Relationship Relationship `json:"relationship"`
	Direction    string       `json:"direction"` // "outgoing" or "incoming"
	Object       Object       `json:"object"`    // the connected object
}

// Edges holds the incoming and outgoing edges for an object.
type Edges struct {
	Incoming []Edge `json:"incoming"`
	Outgoing []Edge `json:"outgoing"`
}

// Branch represents a graph branch for scenario/what-if exploration.
type Branch struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	ProjectID string    `json:"projectId,omitempty"`
	Status    string    `json:"status,omitempty"`
	CreatedAt time.Time `json:"createdAt,omitempty"`
	UpdatedAt time.Time `json:"updatedAt,omitempty"`
}

// SearchResult represents a single result from hybrid or vector search.
type SearchResult struct {
	Object Object  `json:"object"`
	Score  float64 `json:"score"`
	Source string  `json:"source,omitempty"` // "vector", "fts", or "both"
}

// SimilarResult represents a result from the find-similar endpoint.
// The API returns flat object fields with an added `distance` field
// (lower distance = more similar, cosine distance 0.0-2.0).
type SimilarResult struct {
	ID         string         `json:"id"`
	Type       string         `json:"type"`
	Key        string         `json:"key"`
	Properties map[string]any `json:"properties,omitempty"`
	Distance   float64        `json:"distance"`
}

// Score converts distance to a similarity score (1.0 = identical, 0.0 = unrelated).
func (r SimilarResult) Score() float64 {
	// Cosine distance is 0.0-2.0, convert to 0.0-1.0 similarity
	return 1.0 - (r.Distance / 2.0)
}

// ExpandResult represents the result of a BFS graph expansion.
type ExpandResult struct {
	Objects       []Object       `json:"objects"`
	Relationships []Relationship `json:"relationships"`
}

// TraverseResult represents the result of a graph traversal.
type TraverseResult struct {
	Objects       []Object       `json:"objects"`
	Relationships []Relationship `json:"relationships"`
}

// --- Request types ---

// CreateObjectRequest is the request body for creating a graph object.
type CreateObjectRequest struct {
	Type       string         `json:"type"`
	Key        string         `json:"key,omitempty"`
	Status     string         `json:"status,omitempty"`
	Labels     []string       `json:"labels,omitempty"`
	Properties map[string]any `json:"properties,omitempty"`
}

// UpsertObjectRequest is the request body for upserting (create-or-update by type+key).
type UpsertObjectRequest struct {
	Type       string         `json:"type"`
	Key        string         `json:"key"`
	Status     string         `json:"status,omitempty"`
	Labels     []string       `json:"labels,omitempty"`
	Properties map[string]any `json:"properties,omitempty"`
}

// UpdateObjectRequest is the request body for updating an object's properties.
type UpdateObjectRequest struct {
	Properties map[string]any `json:"properties,omitempty"`
	Status     string         `json:"status,omitempty"`
	Labels     []string       `json:"labels,omitempty"`
}

// CreateRelationshipRequest is the request body for creating a relationship.
type CreateRelationshipRequest struct {
	Type       string         `json:"type"`
	FromID     string         `json:"src_id"`
	ToID       string         `json:"dst_id"`
	Properties map[string]any `json:"properties,omitempty"`
}

// CreateBranchRequest is the request body for creating a graph branch.
type CreateBranchRequest struct {
	Name string `json:"name"`
}

// MergeBranchRequest is the request body for merging branches.
type MergeBranchRequest struct {
	SourceBranchID string `json:"sourceBranchId"`
	DryRun         bool   `json:"dryRun,omitempty"`
}

// ExpandRequest is the request body for BFS graph expansion.
type ExpandRequest struct {
	RootIDs           []string `json:"rootIds"`
	MaxDepth          int      `json:"maxDepth,omitempty"`
	MaxNodes          int      `json:"maxNodes,omitempty"`
	RelationshipTypes []string `json:"relationshipTypes,omitempty"`
}

// TraverseRequest is the request body for graph traversal.
type TraverseRequest struct {
	RootIDs           []string `json:"rootIds"`
	MaxDepth          int      `json:"maxDepth,omitempty"`
	MaxNodes          int      `json:"maxNodes,omitempty"`
	Direction         string   `json:"direction,omitempty"` // "outgoing", "incoming", "both"
	RelationshipTypes []string `json:"relationshipTypes,omitempty"`
}

// SearchRequest is the request body for hybrid search.
type SearchRequest struct {
	Query    string   `json:"query"`
	Limit    int      `json:"limit,omitempty"`
	Types    []string `json:"types,omitempty"`
	MinScore float64  `json:"minScore,omitempty"`
}

// ListOptions holds common query parameters for list endpoints.
type ListOptions struct {
	Limit  int
	Offset int    // deprecated — use Cursor for pagination
	Cursor string // cursor from previous page's NextCursor
	Type   string // filter by object/relationship type
	Status string // filter by status
}

// ListPage wraps a page of list results with pagination cursor.
type ListPage[T any] struct {
	Items      []T    `json:"items"`
	NextCursor string `json:"next_cursor"`
	Total      int    `json:"total"`
}

// SimilarOptions holds query parameters for the find-similar endpoint.
type SimilarOptions struct {
	Limit    int
	MinScore float64
	Type     string // filter by object type
}
