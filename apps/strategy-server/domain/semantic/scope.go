package semantic

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sort"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ingest"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

// ErrGraphNotReady means the instance has no projection in Memory yet, so a
// semantic read has nothing of its own to return. Callers turn it into an empty
// result with a hint, never into data from another instance.
var ErrGraphNotReady = errors.New("graph_not_ready: this instance has not been ingested into the semantic graph yet")

const (
	layerArtifact   = "artifact"
	layerDecomposed = "decomposed"

	artifactLayerLabel   = "layer:" + layerArtifact
	decomposedLayerLabel = "layer:" + layerDecomposed

	listObjectsPageLimit = 200
)

// scope is the single read path to Memory for one instance. Everything the
// service or the ripple facade returns passes through it. An object is visible
// only when all three hold:
//
//  1. it carries the label instance:<X>,
//  2. its instance_id property is X,
//  3. its key is in X's manifest, the set of keys the last complete ingest wrote.
//
// Memory is a derived copy of Postgres, so what it holds outside the manifest is
// leftover from an earlier ingest and reads as absent. Relationships are visible
// when both ends are visible and the (type, from, to) tuple is in the manifest.
type scope struct {
	svc   *Service
	id    uuid.UUID
	label string

	// notOwned counts objects dropped for a missing label or a wrong or missing
	// instance_id; notInGraph counts owned objects outside the manifest.
	notOwned, notInGraph int
}

// scope resolves an instance id given as text and checks that its graph is ready.
func (s *Service) scope(ctx context.Context, instanceID string) (*scope, error) {
	if err := s.requireClient(); err != nil {
		return nil, err
	}
	id, err := uuid.Parse(instanceID)
	if err != nil {
		return nil, apperror.ErrBadRequest.WithDetail("invalid instance id")
	}
	return s.scopeFor(ctx, id)
}

// scopeFor fails closed: without a manifest source, or for an instance that has
// none, the graph is not ready and no object is returned.
func (s *Service) scopeFor(ctx context.Context, id uuid.UUID) (*scope, error) {
	if err := s.requireClient(); err != nil {
		return nil, err
	}
	if s.manifest == nil {
		slog.WarnContext(ctx, "semantic: no manifest source configured; every read is treated as not ready")
		return nil, ErrGraphNotReady
	}
	has, err := s.manifest.HasManifest(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("semantic: check manifest of %s: %w", id, err)
	}
	if !has {
		return nil, ErrGraphNotReady
	}
	return &scope{svc: s, id: id, label: "instance:" + id.String()}, nil
}

func hasLabel(o *memory.Object, label string) bool {
	for _, l := range o.Labels {
		if l == label {
			return true
		}
	}
	return false
}

func (sc *scope) owns(o *memory.Object) bool {
	if !hasLabel(o, sc.label) {
		return false
	}
	got, _ := o.Properties["instance_id"].(string)
	return got == sc.id.String()
}

// filter returns the objects visible for the instance, in order. It asks the
// manifest once for all of them.
func (sc *scope) filter(ctx context.Context, objs []memory.Object) ([]memory.Object, error) {
	owned := make([]memory.Object, 0, len(objs))
	keys := make([]string, 0, len(objs))
	for i := range objs {
		if !sc.owns(&objs[i]) {
			sc.notOwned++
			continue
		}
		owned = append(owned, objs[i])
		keys = append(keys, objs[i].Key)
	}
	vis, err := sc.svc.manifest.Visible(ctx, sc.id, keys)
	if err != nil {
		return nil, fmt.Errorf("semantic: manifest lookup for %s: %w", sc.id, err)
	}
	out := owned[:0]
	for _, o := range owned {
		if _, ok := vis[o.Key]; !ok {
			sc.notInGraph++
			continue
		}
		out = append(out, o)
	}
	if sc.notOwned > 0 || sc.notInGraph > 0 {
		slog.DebugContext(ctx, "semantic: dropped objects outside the instance's projection",
			"instance_id", sc.id, "not_owned", sc.notOwned, "not_in_graph", sc.notInGraph)
	}
	return out, nil
}

// filterRelationships keeps the relationships between visible objects whose
// tuple is in the manifest. byID holds the visible objects by Memory id. A
// relationship that names another instance in its instance_id is dropped; one
// without the property is judged by its endpoints and tuple alone.
func (sc *scope) filterRelationships(ctx context.Context, rels []memory.Relationship, byID map[string]*memory.Object) ([]memory.Relationship, error) {
	type cand struct {
		rel   memory.Relationship
		tuple string
	}
	var cands []cand
	tuples := make([]string, 0, len(rels))
	for _, r := range rels {
		from, to := byID[r.FromID], byID[r.ToID]
		if from == nil || to == nil {
			continue
		}
		if p, ok := r.Properties["instance_id"].(string); ok && p != sc.id.String() {
			continue
		}
		t := ingest.RelationshipKey(r.Type, from.Key, to.Key)
		cands = append(cands, cand{r, t})
		tuples = append(tuples, t)
	}
	vis, err := sc.svc.manifest.VisibleRelationships(ctx, sc.id, tuples)
	if err != nil {
		return nil, fmt.Errorf("semantic: manifest relationship lookup for %s: %w", sc.id, err)
	}
	out := make([]memory.Relationship, 0, len(cands))
	seen := make(map[string]bool, len(cands))
	for _, c := range cands {
		if _, ok := vis[c.tuple]; !ok || seen[c.rel.ID+"|"+c.tuple] {
			continue
		}
		seen[c.rel.ID+"|"+c.tuple] = true
		out = append(out, c.rel)
	}
	return out, nil
}

func indexByID(objs []memory.Object) map[string]*memory.Object {
	m := make(map[string]*memory.Object, len(objs))
	for i := range objs {
		m[objs[i].StableID()] = &objs[i]
	}
	return m
}

// originalKey is the key a caller knows an object by: the unscoped artifact or
// section key. A shortened key cannot be reversed, so the writer stored the
// original in source_key.
func (sc *scope) originalKey(o *memory.Object) string {
	if src, _ := o.Properties["source_key"].(string); src != "" && ingest.ScopedKey(sc.id, src) == o.Key {
		return src
	}
	if k, ok := ingest.UnscopedKey(sc.id, o.Key); ok {
		return k
	}
	return o.Key
}

func layerOf(o *memory.Object) string {
	switch {
	case hasLabel(o, artifactLayerLabel):
		return layerArtifact
	case hasLabel(o, decomposedLayerLabel):
		return layerDecomposed
	}
	return ""
}

// list pages through every object of the instance that Memory returns for the
// label and optional type, and keeps the visible ones, sorted by key.
func (sc *scope) list(ctx context.Context, objType string) ([]memory.Object, error) {
	var all []memory.Object
	seen := make(map[string]bool)
	cursor := ""
	for {
		page, err := sc.svc.client.ListObjects(ctx, memory.ListObjectsOptions{
			Type: objType, Label: sc.label, Cursor: cursor, Limit: listObjectsPageLimit,
		})
		if err != nil {
			return nil, err
		}
		for _, o := range page.Items {
			if id := o.StableID(); !seen[id] {
				seen[id] = true
				all = append(all, o)
			}
		}
		if page.NextCursor == "" {
			break
		}
		cursor = page.NextCursor
	}
	vis, err := sc.filter(ctx, all)
	if err != nil {
		return nil, err
	}
	sort.Slice(vis, func(i, j int) bool { return vis[i].Key < vis[j].Key })
	return vis, nil
}

// lookup finds the visible object for an unscoped key.
func (sc *scope) lookup(ctx context.Context, key string) (*memory.Object, error) {
	obj, err := sc.svc.client.GetObjectByKey(ctx, ingest.ScopedKey(sc.id, key))
	if err != nil {
		return nil, fmt.Errorf("lookup node %q: %w", key, err)
	}
	if obj == nil {
		return nil, nil
	}
	vis, err := sc.filter(ctx, []memory.Object{*obj})
	if err != nil || len(vis) == 0 {
		return nil, err
	}
	return &vis[0], nil
}

// expand expands from visible roots and returns the visible objects and
// relationships it found, roots included. Reachability is not recomputed here;
// see neighborhood.
func (sc *scope) expand(ctx context.Context, roots []memory.Object, depth, maxNodes int) ([]memory.Object, []memory.Relationship, error) {
	ids := make([]string, 0, len(roots))
	for i := range roots {
		ids = append(ids, roots[i].StableID())
	}
	expanded, err := sc.svc.client.Expand(ctx, memory.ExpandRequest{RootIDs: ids, MaxDepth: depth, MaxNodes: maxNodes})
	if err != nil {
		return nil, nil, fmt.Errorf("expand: %w", err)
	}
	vis, err := sc.filter(ctx, expanded.Objects)
	if err != nil {
		return nil, nil, err
	}
	byID := indexByID(vis)
	for i := range roots {
		byID[roots[i].StableID()] = &roots[i]
	}
	rels, err := sc.filterRelationships(ctx, expanded.Relationships, byID)
	if err != nil {
		return nil, nil, err
	}
	out := make([]memory.Object, 0, len(byID))
	for _, o := range byID {
		out = append(out, *o)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Key < out[j].Key })
	return out, rels, nil
}

// neighborhood returns the objects reachable from a visible root through
// visible relationships within depth, root included, and those relationships.
// Reachability is recomputed over the filtered graph, so an object that Memory
// reached only through a leftover edge or a leftover object is not returned.
func (sc *scope) neighborhood(ctx context.Context, root *memory.Object, depth, maxNodes int) ([]memory.Object, []memory.Relationship, error) {
	objs, rels, err := sc.expand(ctx, []memory.Object{*root}, depth, maxNodes)
	if err != nil {
		return nil, nil, err
	}
	byID := indexByID(objs)
	adj := make(map[string][]string)
	for _, r := range rels {
		adj[r.FromID] = append(adj[r.FromID], r.ToID)
		adj[r.ToID] = append(adj[r.ToID], r.FromID)
	}
	rootID := root.StableID()
	reached := map[string]bool{rootID: true}
	frontier := []string{rootID}
	for d := 0; d < depth && len(frontier) > 0; d++ {
		var next []string
		for _, id := range frontier {
			for _, n := range adj[id] {
				if !reached[n] {
					reached[n] = true
					next = append(next, n)
				}
			}
		}
		frontier = next
	}
	out := make([]memory.Object, 0, len(reached))
	for id := range reached {
		if o, ok := byID[id]; ok {
			out = append(out, *o)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Key < out[j].Key })
	kept := rels[:0]
	for _, r := range rels {
		if reached[r.FromID] && reached[r.ToID] {
			kept = append(kept, r)
		}
	}
	return out, kept, nil
}
