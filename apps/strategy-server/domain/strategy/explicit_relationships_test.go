package strategy_test

import (
	"context"
	"encoding/json"
	"sort"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

func featureWith(id string, requires ...string) map[string]any {
	reqs := []any{}
	for _, r := range requires {
		reqs = append(reqs, map[string]any{"id": r, "reason": "test"})
	}
	return map[string]any{
		"id": id, "name": "Feature " + id, "status": "ready",
		"dependencies": map[string]any{"requires": reqs},
	}
}

func explicitEdge(source, kind, target, targetType string) (key string, payload map[string]any) {
	key = "rel:" + source + ":" + kind + ":" + target
	return key, map[string]any{"relationships": []any{map[string]any{
		"source_key": source, "target_key": target, "relationship": kind, "target_type": targetType,
	}}}
}

// edges lists the relationships of an artifact as "source>kind>target[ explicit]".
func edges(t *testing.T, svc *strategy.Service, inst uuid.UUID, key string) []string {
	t.Helper()
	rels, err := svc.ListRelationships(context.Background(), inst, key)
	if err != nil {
		t.Fatalf("ListRelationships(%s): %v", key, err)
	}
	var out []string
	for _, r := range rels {
		line := r.SourceKey + ">" + r.Relationship + ">" + r.TargetKey
		var meta map[string]any
		if len(r.Metadata) > 0 {
			_ = json.Unmarshal(r.Metadata, &meta)
		}
		if meta["origin"] == "explicit" {
			line += " explicit"
		}
		out = append(out, line)
	}
	sort.Strings(out)
	return out
}

func assertEdges(t *testing.T, got []string, want ...string) {
	t.Helper()
	sort.Strings(want)
	if len(got) != len(want) {
		t.Fatalf("edges = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("edges = %v, want %v", got, want)
		}
	}
}

func TestExplicitRelationship_LivesOnItsSourceAndOutlastsTheSourceBeingRecommitted(t *testing.T) {
	db := database.TestDB(t)
	svc := strategy.NewService(db)
	inst := seedIntegrityInstance(t, db)

	commitAuto(t, svc, inst, "feature", "fd-001_a", domain.MutationActionCreate, featureWith("fd-001", "fd-002_b"))
	commitAuto(t, svc, inst, "feature", "fd-002_b", domain.MutationActionCreate, featureWith("fd-002"))
	relKey, rel := explicitEdge("fd-001_a", "enables", "fd-002_b", "feature")
	commitAuto(t, svc, inst, "relationship", relKey, domain.MutationActionCreate, rel)

	// The edge sits on the artifact it describes, next to the one the payload derives.
	assertEdges(t, edges(t, svc, inst, "fd-001_a"),
		"fd-001_a>depends_on>fd-002_b",
		"fd-001_a>enables>fd-002_b explicit")

	var row domain.StrategyRelationship
	if err := db.NewSelect().Model(&row).
		Where("instance_id = ? AND relationship = 'enables'", inst).
		Scan(context.Background()); err != nil {
		t.Fatal(err)
	}
	if row.SourceType != "feature" {
		t.Errorf("source_type = %q, want the source's own type %q", row.SourceType, "feature")
	}

	// Committing the source again replaces what its payload derives and keeps the explicit edge.
	commitAuto(t, svc, inst, "feature", "fd-001_a", domain.MutationActionUpdate, featureWith("fd-001"))
	assertEdges(t, edges(t, svc, inst, "fd-001_a"), "fd-001_a>enables>fd-002_b explicit")

	// Archiving the relationship artifact removes exactly its own edge.
	commitAuto(t, svc, inst, "relationship", relKey, domain.MutationActionArchive, rel)
	assertEdges(t, edges(t, svc, inst, "fd-001_a"))
}

func TestExplicitRelationship_ClaimsAnEdgeThePayloadAlsoDerives(t *testing.T) {
	db := database.TestDB(t)
	svc := strategy.NewService(db)
	inst := seedIntegrityInstance(t, db)

	commitAuto(t, svc, inst, "feature", "fd-001_a", domain.MutationActionCreate, featureWith("fd-001", "fd-002_b"))
	relKey, rel := explicitEdge("fd-001_a", "depends_on", "fd-002_b", "feature")
	commitAuto(t, svc, inst, "relationship", relKey, domain.MutationActionCreate, rel)
	assertEdges(t, edges(t, svc, inst, "fd-001_a"), "fd-001_a>depends_on>fd-002_b explicit")

	// The payload stops deriving the edge; the explicit one stays.
	commitAuto(t, svc, inst, "feature", "fd-001_a", domain.MutationActionUpdate, featureWith("fd-001"))
	assertEdges(t, edges(t, svc, inst, "fd-001_a"), "fd-001_a>depends_on>fd-002_b explicit")
}

func TestExplicitRelationship_ReplacesRowsAnEarlierVersionStoredUnderTheRelationshipKey(t *testing.T) {
	db := database.TestDB(t)
	svc := strategy.NewService(db)
	inst := seedIntegrityInstance(t, db)

	commitAuto(t, svc, inst, "feature", "fd-001_a", domain.MutationActionCreate, featureWith("fd-001"))
	relKey, rel := explicitEdge("fd-001_a", "enables", "fd-002_b", "feature")
	if _, err := db.NewInsert().Model(&domain.StrategyRelationship{
		ID: uuid.New(), InstanceID: inst, SourceKey: relKey, SourceType: "relationship",
		TargetKey: "fd-002_b", TargetType: "feature", Relationship: "enables",
	}).Exec(context.Background()); err != nil {
		t.Fatal(err)
	}

	commitAuto(t, svc, inst, "relationship", relKey, domain.MutationActionUpdate, rel)

	assertEdges(t, edges(t, svc, inst, "fd-001_a"), "fd-001_a>enables>fd-002_b explicit")
	assertEdges(t, edges(t, svc, inst, relKey)) // nothing is left under the relationship's own key
}

func TestExplicitRelationship_ToleratesASourceThatDoesNotExist(t *testing.T) {
	db := database.TestDB(t)
	svc := strategy.NewService(db)
	inst := seedIntegrityInstance(t, db)

	relKey, rel := explicitEdge("fd-404", "enables", "fd-002_b", "feature")
	commitAuto(t, svc, inst, "relationship", relKey, domain.MutationActionCreate, rel)

	var row domain.StrategyRelationship
	if err := db.NewSelect().Model(&row).
		Where("instance_id = ? AND source_key = 'fd-404'", inst).
		Scan(context.Background()); err != nil {
		t.Fatalf("the edge must still be indexed: %v", err)
	}
	if row.SourceType != "unknown" {
		t.Errorf("source_type = %q, want %q", row.SourceType, "unknown")
	}
}

func TestResolveArtifactKey(t *testing.T) {
	db := database.TestDB(t)
	svc := strategy.NewService(db)
	inst := seedIntegrityInstance(t, db)
	ctx := context.Background()

	commitAuto(t, svc, inst, "feature", "fd-014_business_directory", domain.MutationActionCreate, featureWith("fd-014"))
	commitAuto(t, svc, inst, "feature", "fd-020_reports", domain.MutationActionCreate, featureWith("fd-020"))
	commitAuto(t, svc, inst, "feature", "fd-020_reports_v2", domain.MutationActionCreate, featureWith("fd-020"))

	for _, tc := range []struct {
		in, want string
		wantErr  bool
	}{
		{"fd-014_business_directory", "fd-014_business_directory", false}, // exact
		{"fd-014", "fd-014_business_directory", false},                    // unique id prefix
		{"fd-020_reports", "fd-020_reports", false},                       // exact wins over a longer sibling
		{"fd-020", "", true}, // ambiguous
		{"fd-999", "", true}, // unknown
		{"fd-01", "", true},  // a partial id is not a prefix of an id
	} {
		got, err := svc.ResolveArtifactKey(ctx, inst, tc.in)
		if (err != nil) != tc.wantErr || got != tc.want {
			t.Errorf("ResolveArtifactKey(%q) = %q, %v; want %q (error=%v)", tc.in, got, err, tc.want, tc.wantErr)
		}
	}
}
