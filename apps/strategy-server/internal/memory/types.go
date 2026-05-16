package memory

import "time"

// Object represents a graph entity in Memory.
type Object struct {
	ID         string         `json:"id"`
	EntityID   string         `json:"entity_id,omitempty"`
	Type       string         `json:"type"`
	Key        string         `json:"key,omitempty"`
	Status     string         `json:"status,omitempty"`
	Labels     []string       `json:"labels,omitempty"`
	Properties map[string]any `json:"properties,omitempty"`
	Version    int            `json:"version,omitempty"`
	BranchID   string         `json:"branch_id,omitempty"`
	CreatedAt  time.Time      `json:"created_at,omitempty"`
	UpdatedAt  time.Time      `json:"updated_at,omitempty"`
}

// StableID returns the most stable identifier — EntityID if set, otherwise ID.
func (o *Object) StableID() string {
	if o.EntityID != "" {
		return o.EntityID
	}
	return o.ID
}

// Relationship represents a directed edge between two objects.
type Relationship struct {
	ID         string         `json:"id"`
	Type       string         `json:"type"`
	FromID     string         `json:"src_id"`
	ToID       string         `json:"dst_id"`
	Properties map[string]any `json:"properties,omitempty"`
	Version    int            `json:"version,omitempty"`
	CreatedAt  time.Time      `json:"created_at,omitempty"`
	UpdatedAt  time.Time      `json:"updated_at,omitempty"`
}

// Edge represents one side of a relationship as seen from a node.
type Edge struct {
	Relationship Relationship `json:"relationship"`
	Direction    string       `json:"direction"` // "outgoing" | "incoming"
	Object       Object       `json:"object"`    // the connected node
}

// Edges groups incoming and outgoing edges for a node.
// The Memory API returns flat Relationship objects in each array — to get
// the connected objects, callers must resolve src_id/dst_id separately.
type Edges struct {
	Incoming []Relationship `json:"incoming"`
	Outgoing []Relationship `json:"outgoing"`
}

// Branch represents a graph branch for what-if exploration.
type Branch struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	ProjectID string    `json:"project_id"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at,omitempty"`
	UpdatedAt time.Time `json:"updated_at,omitempty"`
}

// SearchResult is a single hit from hybrid search.
type SearchResult struct {
	Object Object  `json:"object"`
	Score  float64 `json:"score"`
	Source string  `json:"source"` // "vector", "fts", or "both"
}

// ListPage is a cursor-paginated result set.
type ListPage[T any] struct {
	Items      []T    `json:"items"`
	NextCursor string `json:"next_cursor,omitempty"`
	Total      int    `json:"total,omitempty"`
}

// InstalledSchema describes a schema (template pack) installed in a project.
type InstalledSchema struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Version     string `json:"version,omitempty"`
}

// MergeResult is the response from merging a branch.
type MergeResult struct {
	ObjectsCreated      int `json:"objects_created"`
	ObjectsUpdated      int `json:"objects_updated"`
	RelationshipsCreated int `json:"relationships_created"`
}

// SubgraphResult is the response from an atomic subgraph creation.
type SubgraphResult struct {
	Objects       []Object       `json:"objects"`
	Relationships []Relationship `json:"relationships"`
	RefMap        map[string]string `json:"ref_map,omitempty"`
}

// EmbeddingProgress reports the status of the embedding queue.
type EmbeddingProgress struct {
	Pending    int `json:"pending"`
	Processing int `json:"processing"`
	Completed  int `json:"completed"`
	Failed     int `json:"failed"`
	Total      int `json:"total"`
}
