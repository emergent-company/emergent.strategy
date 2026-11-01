package semantic

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"testing"
)

func hit(key string, props map[string]any, score float64) map[string]any {
	return map[string]any{
		"object": map[string]any{"id": "id-" + key, "type": "x", "key": key, "labels": ownerLabels, "properties": props},
		"score":  score,
		"source": "vector",
	}
}

func decomposedHit(key string, props map[string]any, score float64) map[string]any {
	h := hit(key, props, score)
	h["object"].(map[string]any)["labels"] = []string{"instance:" + stubInstance, "layer:decomposed"}
	return h
}

// unlayeredHit carries the owner label but neither layer label, so nothing about
// where it came from can be established.
func unlayeredHit(key string, props map[string]any, score float64) map[string]any {
	h := hit(key, props, score)
	h["object"].(map[string]any)["labels"] = []string{"instance:" + stubInstance}
	return h
}

func searchServer(t *testing.T, hits []map[string]any, gotLimit *int) *Service {
	t.Helper()
	return stubService(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/graph/search" {
			w.WriteHeader(404)
			return
		}
		if gotLimit != nil {
			body, _ := io.ReadAll(r.Body)
			var req struct {
				Limit int `json:"limit"`
			}
			_ = json.Unmarshal(body, &req)
			*gotLimit = req.Limit
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"results": hits})
	}))
}

func TestSearchStrategyScoped_DropsFrameworkAndOtherInstanceHitsAndCountsThem(t *testing.T) {
	hits := []map[string]any{
		hit("sd-001", map[string]any{"artifact_type": "definition", "instance_id": stubInstance, "integrity_class": "canonical_reference", "snippet": "framework"}, 0.99),
		hit("north_star", map[string]any{"artifact_type": "north_star", "instance_id": stubInstance, "snippet": "ours"}, 0.9),
		hit("other-tenant-thing", map[string]any{"artifact_type": "north_star", "instance_id": "00000000-0000-0000-0000-00000000dead", "snippet": "theirs"}, 0.8),
		hit("kr-1", map[string]any{"artifact_type": "roadmap_recipe", "snippet": "no instance property"}, 0.7),
	}
	svc := searchServer(t, hits, nil)

	out, err := svc.SearchStrategyScoped(context.Background(), stubInstance, "anything", 10)
	if err != nil {
		t.Fatalf("SearchStrategyScoped: %v", err)
	}
	keys := map[string]bool{}
	for _, r := range out.Results {
		keys[r.ArtifactKey] = true
	}
	if keys["sd-001"] {
		t.Error("a framework-class hit was returned as strategy")
	}
	if keys["other-tenant-thing"] {
		t.Error("a hit belonging to another instance was returned")
	}
	if keys["kr-1"] {
		t.Error("a hit with no instance_id was returned; unattributed data is never returned (fence 9.2)")
	}
	if !keys["north_star"] {
		t.Errorf("results = %v, want the instance's own hit", keys)
	}
	if out.ExcludedFramework != 1 || out.ExcludedOtherInstance != 2 {
		t.Errorf("excluded framework=%d not_owned=%d, want 1 and 2 (another instance's hit and an unattributed one)", out.ExcludedFramework, out.ExcludedOtherInstance)
	}
}

func TestSearchStrategyScoped_OverFetchIsCappedAt100(t *testing.T) {
	var gotLimit int
	svc := searchServer(t, nil, &gotLimit)
	if _, err := svc.SearchStrategyScoped(context.Background(), stubInstance, "q", 80); err != nil {
		t.Fatal(err)
	}
	if gotLimit != 100 {
		t.Errorf("asked Memory for %d hits, want the cap of 100", gotLimit)
	}
}

func TestSearchStrategyScoped_OverFetchesThenTrims(t *testing.T) {
	var hits []map[string]any
	for i := 0; i < 9; i++ {
		hits = append(hits, hit("k"+string(rune('a'+i)), map[string]any{"artifact_type": "x", "instance_id": stubInstance}, 0.9))
	}
	var gotLimit int
	svc := searchServer(t, hits, &gotLimit)

	out, err := svc.SearchStrategyScoped(context.Background(), stubInstance, "q", 3)
	if err != nil {
		t.Fatal(err)
	}
	if gotLimit != 6 {
		t.Errorf("asked Memory for %d hits, want 6 (limit 3 over-fetched twofold) so filtering cannot starve the page", gotLimit)
	}
	if len(out.Results) != 3 {
		t.Errorf("returned %d results, want 3", len(out.Results))
	}
}

func TestSearchStrategyScoped_HitsPointToTheRead(t *testing.T) {
	hits := []map[string]any{
		hit("north_star", map[string]any{"artifact_type": "north_star", "instance_id": stubInstance}, 0.9),
		decomposedHit("Belief:north_star:vision", map[string]any{
			"source_artifact": "READY/00_north_star.yaml", "section_path": "north_star.vision", "instance_id": stubInstance,
		}, 0.8),
		decomposedHit("Objective:x", map[string]any{
			"source_artifact": "READY/05_roadmap_recipe.yaml", "section_path": "roadmap.tracks.commercial.okrs[0]", "instance_id": stubInstance,
		}, 0.7),
		unlayeredHit("mystery", map[string]any{"name": "no pointers", "instance_id": stubInstance}, 0.6),
	}
	svc := searchServer(t, hits, nil)

	out, err := svc.SearchStrategyScoped(context.Background(), stubInstance, "q", 10)
	if err != nil {
		t.Fatal(err)
	}
	by := map[string]*SearchResult{}
	for _, r := range out.Results {
		by[r.ArtifactKey] = r
	}
	if r := by["north_star"]; r.Artifact != "north_star" || r.Path != "" {
		t.Errorf("artifact-level hit: artifact=%q path=%q", r.Artifact, r.Path)
	}
	if r := by["Belief:north_star:vision"]; r.Artifact != "north_star" || r.Path != "north_star.vision" {
		t.Errorf("decomposed hit: artifact=%q path=%q", r.Artifact, r.Path)
	}
	if r := by["Objective:x"]; r.Artifact != "roadmap_recipe" || r.Path != "roadmap.tracks.commercial.okrs[0]" {
		t.Errorf("roadmap hit: artifact=%q path=%q", r.Artifact, r.Path)
	}
	if r := by["mystery"]; r == nil || r.Artifact != "" {
		t.Errorf("a hit with no provenance must not invent a pointer: %+v", r)
	}
}

func TestSearchStrategy_StillReturnsResults(t *testing.T) {
	svc := searchServer(t, []map[string]any{hit("fd-001", map[string]any{"artifact_type": "feature", "instance_id": stubInstance}, 0.9)}, nil)
	res, err := svc.SearchStrategy(context.Background(), stubInstance, "q", 5)
	if err != nil || len(res) != 1 {
		t.Fatalf("res=%v err=%v", res, err)
	}
}
