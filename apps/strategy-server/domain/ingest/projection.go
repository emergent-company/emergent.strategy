package ingest

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/dialect/pgdialect"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/decompose"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory"
)

// relSpec is one relationship of the projection. Both ends are scoped keys.
type relSpec struct {
	typ        string
	from, to   string
	properties map[string]any
}

func (r relSpec) manifestKey() string { return RelationshipKey(r.typ, r.from, r.to) }

// projection is everything one ingest writes for an instance, computed before
// anything is sent to Memory. Its keys become the instance's manifest.
type projection struct {
	objects []memory.UpsertObjectRequest
	rels    []relSpec

	// Counts per layer, recorded on the instance row.
	artifactObjects, artifactRels     int
	decomposedObjects, decomposedRels int
}

func (p *projection) objectKeys() map[string]struct{} {
	out := make(map[string]struct{}, len(p.objects))
	for _, o := range p.objects {
		out[o.Key] = struct{}{}
	}
	return out
}

func (p *projection) relKeys() map[string]struct{} {
	out := make(map[string]struct{}, len(p.rels))
	for _, r := range p.rels {
		out[r.manifestKey()] = struct{}{}
	}
	return out
}

// fileClass is the integrity classification of one exported artifact file.
type fileClass struct {
	class string
	ref   string
}

// ownerProperties returns the properties every object of an instance carries.
// source_key holds the original key when the scoped key had to be shortened.
func ownerProperties(instanceID uuid.UUID, props map[string]any, originalKey string) map[string]any {
	out := make(map[string]any, len(props)+2)
	for k, v := range props {
		out[k] = v
	}
	out["instance_id"] = instanceID.String()
	if IsShortened(instanceID, originalKey) {
		out["source_key"] = originalKey
	}
	return out
}

// artifactProjection builds the artifact layer: one object per non-archived
// artifact, and the relationships whose both ends are such artifacts.
//
// A relationship target is an artifact key or the short id of one ("fd-002"
// for "fd-002_name"); anything else, such as a value-model path, is not an
// artifact and produces no edge. artifacts must be in a stable order so that
// two artifacts sharing a short id always resolve it the same way.
func artifactProjection(instanceID uuid.UUID, artifacts []domain.StrategyArtifact, rels []domain.StrategyRelationship) *projection {
	p := &projection{}
	owner := ownerLabel(instanceID)

	exact := make(map[string]string, len(artifacts))
	short := make(map[string]string)
	for _, a := range artifacts {
		obj := artifactToSubgraphObject(a, "")
		scoped := ScopedKey(instanceID, a.ArtifactKey)
		p.objects = append(p.objects, memory.UpsertObjectRequest{
			Type:       obj.Type,
			Key:        scoped,
			Status:     obj.Status,
			Labels:     append(obj.Labels, owner),
			Properties: ownerProperties(instanceID, obj.Properties, a.ArtifactKey),
		})
		exact[a.ArtifactKey] = scoped
		if i := strings.Index(a.ArtifactKey, "_"); i > 0 {
			if _, claimed := short[a.ArtifactKey[:i]]; !claimed {
				short[a.ArtifactKey[:i]] = scoped
			}
		}
	}
	p.artifactObjects = len(p.objects)

	resolve := func(key string) string {
		if k, ok := exact[key]; ok {
			return k
		}
		return short[key]
	}
	seen := make(map[string]struct{}, len(rels))
	for _, r := range rels {
		from, to := resolve(r.SourceKey), resolve(r.TargetKey)
		if from == "" || to == "" {
			continue
		}
		spec := relSpec{typ: r.Relationship, from: from, to: to, properties: map[string]any{"instance_id": instanceID.String()}}
		if _, dup := seen[spec.manifestKey()]; dup {
			continue
		}
		seen[spec.manifestKey()] = struct{}{}
		p.rels = append(p.rels, spec)
	}
	p.artifactRels = len(p.rels)
	return p
}

// decomposedProjection builds the decomposed layer from the decomposer output.
// Every object gets the owner stamp and the integrity class of the artifacts it
// was derived from; files maps an exported file path to the class of its
// artifact. Duplicate keys keep their first object, so the result does not
// depend on write order. The decomposer output is not modified.
func decomposedProjection(instanceID uuid.UUID, res *decompose.Result, files map[string]fileClass) *projection {
	p := &projection{}
	owner := ownerLabel(instanceID)
	sources := decomposedSources(res)

	known := make(map[string]string, len(res.Objects)) // decomposer key -> scoped key
	for _, obj := range res.Objects {
		if _, dup := known[obj.Key]; dup {
			continue
		}
		scoped := ScopedKey(instanceID, obj.Key)
		known[obj.Key] = scoped

		labels := append(append([]string{}, obj.Labels...), "layer:decomposed", owner)
		props := ownerProperties(instanceID, obj.Properties, obj.Key)
		if fc, ok := sourceIntegrity(sources[obj.Key], files); ok {
			labels = append(labels, "integrity:"+fc.class)
			props["integrity_class"] = fc.class
			if fc.ref != "" {
				props["integrity_ref"] = fc.ref
			}
		}
		p.objects = append(p.objects, memory.UpsertObjectRequest{
			Type: obj.Type, Key: scoped, Status: obj.Status, Labels: labels, Properties: props,
		})
	}
	p.decomposedObjects = len(p.objects)

	seen := make(map[string]struct{}, len(res.Relationships))
	for _, r := range res.Relationships {
		from, ok1 := known[r.FromKey]
		to, ok2 := known[r.ToKey]
		if !ok1 || !ok2 {
			continue
		}
		props := make(map[string]any, len(r.Properties)+1)
		for k, v := range r.Properties {
			props[k] = v
		}
		props["instance_id"] = instanceID.String()
		spec := relSpec{typ: r.Type, from: from, to: to, properties: props}
		if _, dup := seen[spec.manifestKey()]; dup {
			continue
		}
		seen[spec.manifestKey()] = struct{}{}
		p.rels = append(p.rels, spec)
	}
	p.decomposedRels = len(p.rels)
	return p
}

// decomposedSources returns, for every decomposed object, the exported files it
// comes from: the file named in its source_artifact property plus the artifact
// nodes that contain it, directly or through other objects. Sorted, no
// duplicates. An artifact node is its own source.
func decomposedSources(res *decompose.Result) map[string][]string {
	artifactFile := make(map[string]string)
	for _, o := range res.Objects {
		if o.Type != "Artifact" {
			continue
		}
		file, _ := o.Properties["file_path"].(string)
		if file == "" {
			file = strings.TrimPrefix(o.Key, "Artifact:")
		}
		artifactFile[o.Key] = file
	}
	parents := make(map[string][]string)
	for _, r := range res.Relationships {
		if r.Type == "contains" {
			parents[r.ToKey] = append(parents[r.ToKey], r.FromKey)
		}
	}

	out := make(map[string][]string, len(res.Objects))
	for _, o := range res.Objects {
		set := make(map[string]struct{})
		if f, ok := artifactFile[o.Key]; ok {
			set[f] = struct{}{}
		}
		if src, _ := o.Properties["source_artifact"].(string); src != "" {
			set[src] = struct{}{}
		}
		visited := map[string]bool{o.Key: true}
		stack := append([]string(nil), parents[o.Key]...)
		for len(stack) > 0 {
			k := stack[len(stack)-1]
			stack = stack[:len(stack)-1]
			if visited[k] {
				continue
			}
			visited[k] = true
			if f, ok := artifactFile[k]; ok {
				set[f] = struct{}{}
			}
			stack = append(stack, parents[k]...)
		}
		list := make([]string, 0, len(set))
		for f := range set {
			list = append(list, f)
		}
		sort.Strings(list)
		out[o.Key] = list
	}
	return out
}

// sourceIntegrity decides the integrity class of a decomposed object from its
// source files. It is stamped only when every source is a classified file: one
// authored source makes the object authored content. With several classes the
// first source decides; the reference is kept only when all sources agree on it.
func sourceIntegrity(sources []string, files map[string]fileClass) (fileClass, bool) {
	if len(sources) == 0 {
		return fileClass{}, false
	}
	first := files[sources[0]]
	if first.class == "" {
		return fileClass{}, false
	}
	ref := first.ref
	for _, s := range sources[1:] {
		fc := files[s]
		if fc.class == "" {
			return fileClass{}, false
		}
		if fc.ref != ref {
			ref = ""
		}
	}
	return fileClass{class: first.class, ref: ref}, true
}

// splitRelationshipKey reverses RelationshipKey using the set of known object
// keys, because a key may itself contain the separator. The relationship type
// is the text before the first separator.
func splitRelationshipKey(key string, known map[string]string) (typ, from, to string, ok bool) {
	typ, rest, found := strings.Cut(key, "|")
	if !found {
		return "", "", "", false
	}
	for i := 0; i < len(rest); i++ {
		if rest[i] != '|' {
			continue
		}
		f, t := rest[:i], rest[i+1:]
		if _, ok1 := known[f]; !ok1 {
			continue
		}
		if _, ok2 := known[t]; ok2 {
			return typ, f, t, true
		}
	}
	return "", "", "", false
}

// decompose exports the instance, runs the decomposer over the export and
// returns its result with the integrity class of each exported file.
func (s *Service) decomposeInstance(ctx context.Context, instanceID uuid.UUID, classOf map[string]fileClass) (*decompose.Result, map[string]fileClass, error) {
	export, err := s.exporter.ExportInstance(ctx, instanceID)
	if err != nil {
		return nil, nil, fmt.Errorf("export instance for decompose: %w", err)
	}

	tmpDir, err := os.MkdirTemp("", "ingest-decompose-*")
	if err != nil {
		return nil, nil, fmt.Errorf("create temp dir: %w", err)
	}
	defer func() {
		if rmErr := os.RemoveAll(tmpDir); rmErr != nil {
			slog.Warn("ingest: failed to remove temp dir", "dir", tmpDir, "err", rmErr)
		}
	}()

	files := make(map[string]fileClass, len(export.Files))
	for _, f := range export.Files {
		dest := filepath.Join(tmpDir, f.RelPath)
		if mkErr := os.MkdirAll(filepath.Dir(dest), 0o750); mkErr != nil {
			return nil, nil, fmt.Errorf("mkdir for %s: %w", f.RelPath, mkErr)
		}
		if writeErr := os.WriteFile(dest, []byte(f.Content), 0o600); writeErr != nil {
			return nil, nil, fmt.Errorf("write %s: %w", f.RelPath, writeErr)
		}
		files[f.RelPath] = classOf[f.ArtifactKey]
	}

	result, err := decompose.New(tmpDir).DecomposeInstance()
	if err != nil {
		return nil, nil, fmt.Errorf("decompose instance: %w", err)
	}
	for _, w := range result.Warnings {
		slog.Debug("ingest: decompose warning", "instance_id", instanceID, "msg", w)
	}
	slog.Info("ingest: decompose complete", "instance_id", instanceID,
		"objects", len(result.Objects), "relationships", len(result.Relationships))
	return result, files, nil
}

// manifest is the stored projection of one instance.
type manifest struct {
	objects map[string]struct{}
	rels    map[string]struct{}
}

func (s *Service) loadManifest(ctx context.Context, instanceID uuid.UUID) (*manifest, error) {
	var rows []struct {
		Kind string `bun:"kind"`
		Key  string `bun:"key"`
	}
	if err := s.db.NewRaw(`SELECT kind, key FROM memory_projection WHERE instance_id = ?`, instanceID).Scan(ctx, &rows); err != nil {
		return nil, fmt.Errorf("load manifest of %s: %w", instanceID, err)
	}
	m := &manifest{objects: map[string]struct{}{}, rels: map[string]struct{}{}}
	for _, r := range rows {
		if r.Kind == projectionRelationship {
			m.rels[r.Key] = struct{}{}
		} else {
			m.objects[r.Key] = struct{}{}
		}
	}
	return m, nil
}

// insertProjection stores one kind of manifest rows in one statement.
func insertProjection(ctx context.Context, tx bun.Tx, instanceID uuid.UUID, kind string, keys map[string]struct{}) error {
	if len(keys) == 0 {
		return nil
	}
	list := make([]string, 0, len(keys))
	for k := range keys {
		list = append(list, k)
	}
	_, err := tx.NewRaw(
		`INSERT INTO memory_projection (instance_id, kind, key) SELECT ?, ?, unnest(?::text[])`,
		instanceID, kind, pgdialect.Array(list),
	).Exec(ctx)
	return err
}
