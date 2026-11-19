package mcpserver_test

import (
	"encoding/json"
	"sort"
	"strings"
	"testing"

	"github.com/google/uuid"
)

func TestMCP_ValidateRelationships_ResolvesRoadmapObjectsAndShortFeatureIDs(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)

	roadmap := map[string]any{"roadmap": map[string]any{"id": "rm-1", "tracks": map[string]any{"product": map[string]any{
		"okrs": []any{map[string]any{"id": "okr-p-001", "objective": "Now", "key_results": []any{
			map[string]any{"id": "kr-p-001", "description": "Current KR", "target": "1"}}}},
		"future_okrs_q3_2026": []any{map[string]any{"id": "okr-p-010", "objective": "Later", "key_results": []any{
			map[string]any{"id": "kr-p-010", "description": "Future KR", "target": "1"}}}},
		"riskiest_assumptions": []any{map[string]any{"id": "asm-p-001", "description": "Track level"}},
	}}}}
	_, instID := seedInstance(t, svc, "vr-owner-"+uuid.New().String()[:8], map[string]any{"roadmap_recipe": roadmap})

	create := func(id int, key string, payload map[string]any) {
		t.Helper()
		raw, _ := json.Marshal(payload)
		var sr struct {
			BatchID string `json:"batch_id"`
		}
		c.call(id, "create_feature", map[string]any{
			"instance_id": instID.String(), "feature_key": key, "payload": string(raw),
		}).assertOK().decode(&sr)
		c.call(id+1, "commit_batch", map[string]any{"batch_id": sr.BatchID}).assertOK()
	}

	// References that resolve: a key result in a future group, a track-level
	// assumption, a track label, and a feature named by its short id.
	// References that do not: an unknown key result, assumption and feature.
	create(1, "fd-014_business_directory", map[string]any{
		"id": "fd-014", "name": "Business Directory", "status": "ready",
		"strategic_context": map[string]any{
			"tracks":             []any{"product"},
			"assumptions_tested": []any{"asm-p-001", "asm-p-404"},
		},
		"feature_maturity": map[string]any{"capability_maturity": []any{
			map[string]any{"capability_id": "cap-1", "delivered_by_kr": "kr-p-010"},
			map[string]any{"capability_id": "cap-2", "delivered_by_kr": "kr-p-404"},
		}},
	})
	create(3, "fd-015_reports", map[string]any{
		"id": "fd-015", "name": "Reports", "status": "ready",
		"dependencies": map[string]any{"requires": []any{
			map[string]any{"id": "fd-014", "reason": "needs the directory"},
			map[string]any{"id": "fd-999", "reason": "does not exist"},
		}},
	})

	var got struct {
		Broken []struct {
			TargetKey string `json:"target_key"`
		} `json:"broken"`
	}
	c.call(5, "validate_relationships", map[string]any{"instance_id": instID.String()}).assertOK().decode(&got)

	var broken []string
	for _, b := range got.Broken {
		broken = append(broken, b.TargetKey)
	}
	sort.Strings(broken)
	if want := "asm-p-404,fd-999,kr-p-404"; strings.Join(broken, ",") != want {
		t.Errorf("broken targets = %v, want exactly %s: a key result in future_okrs_*, a track-level assumption, a track label and a short feature id must all resolve", broken, want)
	}
}
