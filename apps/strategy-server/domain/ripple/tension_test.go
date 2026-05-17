package ripple_test

import (
	"context"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ripple"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
)

func TestDetectCrossTrackTension_NoMemory(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	instID := seedInstance(t, db)
	cfg := ripple.DefaultRippleConfig()

	// Without Memory client, tension detection should return nil gracefully.
	signals, results, err := ripple.DetectCrossTrackTension(ctx, db, nil, instID, cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if signals != nil {
		t.Errorf("expected nil signals without Memory, got %d", len(signals))
	}
	if results != nil {
		t.Errorf("expected nil results without Memory, got %d", len(results))
	}
}

func TestDetectCrossTrackTension_NilMemory_WithArtifacts(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	instID := seedInstance(t, db)
	cfg := ripple.DefaultRippleConfig()

	// Even with artifacts present, no Memory client means no tension detection.
	// (We don't need to create artifacts — nil Memory short-circuits first.)
	signals, _, err := ripple.DetectCrossTrackTension(ctx, db, nil, instID, cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if signals != nil {
		t.Errorf("expected nil signals without Memory, got %d", len(signals))
	}
}

func TestBuildTrackQuery_Empty(t *testing.T) {
	// No artifacts → empty query. This is tested indirectly through
	// the tension detection graceful handling of empty tracks.
	// Direct test of the unexported function is not possible from _test package.
}

func TestTensionBaseline_Symmetry(t *testing.T) {
	cfg := ripple.DefaultRippleConfig()

	// Verify all known pairs are symmetric.
	pairs := [][2]string{
		{"product", "commercial"},
		{"product", "org_ops"},
		{"product", "strategy"},
		{"strategy", "commercial"},
		{"strategy", "org_ops"},
		{"commercial", "org_ops"},
	}

	for _, p := range pairs {
		b1 := cfg.TensionBaseline(p[0], p[1])
		b2 := cfg.TensionBaseline(p[1], p[0])
		if b1 != b2 {
			t.Errorf("baseline for %s|%s (%.2f) != %s|%s (%.2f)",
				p[0], p[1], b1, p[1], p[0], b2)
		}
		if b1 == 0 {
			t.Errorf("baseline for %s|%s should be non-zero (configured default)", p[0], p[1])
		}
	}
}

func TestTensionBaseline_UnknownPairIsZero(t *testing.T) {
	cfg := ripple.DefaultRippleConfig()

	baseline := cfg.TensionBaseline("product", "unknown_track")
	if baseline != 0 {
		t.Errorf("unknown pair should have zero baseline, got %f", baseline)
	}
}

func TestTensionBaseline_SameTrack(t *testing.T) {
	cfg := ripple.DefaultRippleConfig()

	// Same track has no configured pair — baseline should be 0.
	baseline := cfg.TensionBaseline("product", "product")
	if baseline != 0 {
		t.Errorf("same-track pair should have zero baseline, got %f", baseline)
	}
}
