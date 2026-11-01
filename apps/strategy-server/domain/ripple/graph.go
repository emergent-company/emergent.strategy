package ripple

import (
	"context"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/semantic"
)

// Graph is the read access ripple has to the semantic graph. It is bound to one
// instance and speaks in the keys of the strategy tables, so ripple never sees
// the instance prefix of Memory keys or another instance's objects.
// *semantic.ScopedGraph implements it.
type Graph interface {
	// Search returns the instance's best hits for a query, optionally restricted
	// to object types.
	Search(ctx context.Context, query string, limit int, types []string) ([]semantic.GraphHit, error)
	// Neighborhood returns the objects within depth of the object with the given
	// key, itself included; ok is false when the key is not in the instance's graph.
	Neighborhood(ctx context.Context, key string, depth, maxNodes int) (nodes []semantic.GraphNode, ok bool, err error)
}

// GraphFor returns the graph facade of an instance, or nil when semantic
// features are not available. Callers pass the result straight to ripple, where
// nil means "no semantic analysis".
func GraphFor(svc *semantic.Service, instanceID uuid.UUID) Graph {
	if svc == nil || !svc.IsAvailable() {
		return nil
	}
	return svc.ScopedGraph(instanceID)
}
