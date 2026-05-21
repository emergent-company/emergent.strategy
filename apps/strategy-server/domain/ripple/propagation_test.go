package ripple_test

// Stage 2.5: Tests that verify the SQL fallback path (nil memory client)
// produces correct co-reference results, matching the behaviour of the
// pre-refactor multi-hop SQL loop.

import (
	"context"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ripple"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

// TestAnalyzeStructuralRipple_NilMemory_SQLFallback verifies that passing a nil
// memory client causes the function to use the SQL co-reference path and
// correctly identifies transitively affected artifacts.
func TestAnalyzeStructuralRipple_NilMemory_SQLFallback(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	instID := seedInstance(t, db)

	// Create artifacts:
	//   north_star — the changed artifact
	//   fd-001     — also references "asm-001" (transitive co-reference)
	//   fd-002     — also references "asm-001" (transitive co-reference)
	//
	// Relationship graph:
	//   north_star --tests_assumption--> asm-001
	//   fd-001     --tests_assumption--> asm-001
	//   fd-002     --tests_assumption--> asm-001
	//
	// Expected: fd-001 and fd-002 appear as "transitive" in the ripple report
	// when north_star is the changed artifact (SQL fallback, no Memory client).

	artDefs := []struct{ key, typ string }{
		{"north_star", "north_star"},
		{"fd-001", "feature"},
		{"fd-002", "feature"},
	}
	for _, a := range artDefs {
		payload := []byte(`{"name":"` + a.key + `"}`)
		mutID := uuid.New()
		_, err := db.NewInsert().Model(&domain.StrategyMutation{
			ID:           mutID,
			InstanceID:   instID,
			ArtifactType: a.typ,
			ArtifactKey:  a.key,
			Action:       domain.MutationActionCreate,
			Payload:      payload,
			Status:       domain.MutationStatusCommitted,
			Source:       "system",
		}).Exec(ctx)
		if err != nil {
			t.Fatalf("seed mutation %s: %v", a.key, err)
		}
		_, err = db.NewInsert().Model(&domain.StrategyArtifact{
			ID:           uuid.New(),
			InstanceID:   instID,
			ArtifactKey:  a.key,
			ArtifactType: a.typ,
			Status:       domain.ArtifactStatusActive,
			Payload:      payload,
			MutationID:   mutID,
		}).Exec(ctx)
		if err != nil {
			t.Fatalf("seed artifact %s: %v", a.key, err)
		}
	}

	relDefs := []struct{ src, tgt, rel string }{
		{"north_star", "asm-001", domain.RelTestsAssumption},
		{"fd-001", "asm-001", domain.RelTestsAssumption},
		{"fd-002", "asm-001", domain.RelTestsAssumption},
	}
	for _, r := range relDefs {
		_, err := db.NewInsert().Model(&domain.StrategyRelationship{
			ID:           uuid.New(),
			InstanceID:   instID,
			SourceKey:    r.src,
			TargetKey:    r.tgt,
			Relationship: r.rel,
		}).Exec(ctx)
		if err != nil {
			t.Fatalf("seed relationship %s→%s: %v", r.src, r.tgt, err)
		}
	}

	// Call with nil memory client → SQL fallback path.
	report, err := ripple.AnalyzeStructuralRipple(ctx, db, nil, instID, "north_star", "north_star")
	if err != nil {
		t.Fatalf("AnalyzeStructuralRipple: %v", err)
	}

	// fd-001 and fd-002 must appear as transitive artifacts.
	transitiveKeys := make(map[string]bool)
	for _, a := range report.AffectedArtifacts {
		if a.Direction == "transitive" {
			transitiveKeys[a.ArtifactKey] = true
		}
	}

	if !transitiveKeys["fd-001"] {
		t.Errorf("expected fd-001 in transitive affected artifacts; got: %v", report.AffectedArtifacts)
	}
	if !transitiveKeys["fd-002"] {
		t.Errorf("expected fd-002 in transitive affected artifacts; got: %v", report.AffectedArtifacts)
	}
	// The changed artifact itself must NOT appear.
	for _, a := range report.AffectedArtifacts {
		if a.ArtifactKey == "north_star" {
			t.Errorf("changed artifact north_star should not appear in affected list")
		}
	}
}

// TestAnalyzeStructuralRipple_NilMemory_NoTransitive verifies that when there
// are no co-referencing artifacts, the transitive list is empty.
func TestAnalyzeStructuralRipple_NilMemory_NoTransitive(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	instID := seedInstance(t, db)

	payload := []byte(`{"name":"North Star"}`)
	mutID := uuid.New()
	_, err := db.NewInsert().Model(&domain.StrategyMutation{
		ID:           mutID,
		InstanceID:   instID,
		ArtifactType: "north_star",
		ArtifactKey:  "north_star",
		Action:       domain.MutationActionCreate,
		Payload:      payload,
		Status:       domain.MutationStatusCommitted,
		Source:       "system",
	}).Exec(ctx)
	if err != nil {
		t.Fatalf("seed mutation: %v", err)
	}
	_, err = db.NewInsert().Model(&domain.StrategyArtifact{
		ID:           uuid.New(),
		InstanceID:   instID,
		ArtifactKey:  "north_star",
		ArtifactType: "north_star",
		Status:       domain.ArtifactStatusActive,
		Payload:      payload,
		MutationID:   mutID,
	}).Exec(ctx)
	if err != nil {
		t.Fatalf("seed artifact: %v", err)
	}

	// north_star points at a value path — no other artifact co-references it.
	_, err = db.NewInsert().Model(&domain.StrategyRelationship{
		ID:           uuid.New(),
		InstanceID:   instID,
		SourceKey:    "north_star",
		TargetKey:    "vm-product/growth",
		Relationship: domain.RelContributesTo,
	}).Exec(ctx)
	if err != nil {
		t.Fatalf("seed relationship: %v", err)
	}

	report, err := ripple.AnalyzeStructuralRipple(ctx, db, nil, instID, "north_star", "north_star")
	if err != nil {
		t.Fatalf("AnalyzeStructuralRipple: %v", err)
	}

	for _, a := range report.AffectedArtifacts {
		if a.Direction == "transitive" {
			t.Errorf("expected no transitive artifacts, got: %+v", a)
		}
	}
}
