package integration

import (
	"testing"

	"github.com/emergent-company/product-factory-os/apps/epf-cli/internal/roadmap"
)

func TestRoadmapIntegration_RealInstance(t *testing.T) {
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Test instance not found")
	}

	loader := roadmap.NewLoader(instancePath)
	rm, err := loader.Load()
	if err != nil {
		t.Fatalf("Failed to load roadmap: %v", err)
	}

	t.Logf("Loaded roadmap: %s (cycle %d, timeframe: %s)", rm.ID, rm.Cycle, rm.Timeframe)

	// Verify basic structure
	if rm.ID == "" {
		t.Error("Roadmap ID is empty")
	}

	// Count KRs per track
	productKRs := rm.GetKRsByTrack(roadmap.TrackProduct)
	strategyKRs := rm.GetKRsByTrack(roadmap.TrackStrategy)
	orgOpsKRs := rm.GetKRsByTrack(roadmap.TrackOrgOps)
	commercialKRs := rm.GetKRsByTrack(roadmap.TrackCommercial)

	t.Logf("KR counts: Product=%d, Strategy=%d, OrgOps=%d, Commercial=%d",
		len(productKRs), len(strategyKRs), len(orgOpsKRs), len(commercialKRs))

	// Verify we have some KRs
	allKRs := rm.GetAllKRs()
	if len(allKRs) == 0 {
		t.Error("No KRs found in roadmap")
	}
	t.Logf("Total KRs: %d", len(allKRs))

	// Log a few sample KRs
	for i, kr := range allKRs {
		if i >= 5 {
			break
		}
		t.Logf("  - %s: %s", kr.ID, truncate(kr.Description, 60))
	}
}

func TestRoadmapIntegration_KRIndex(t *testing.T) {
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Test instance not found")
	}

	loader := roadmap.NewLoader(instancePath)
	rm, err := loader.Load()
	if err != nil {
		t.Fatalf("Failed to load roadmap: %v", err)
	}

	idx := roadmap.NewKRIndex(rm)

	// Test ByID
	t.Logf("KRs indexed by ID: %d", len(idx.ByID))

	// Test ByTrack
	for track, entries := range idx.ByTrack {
		t.Logf("Track %s: %d KRs", track, len(entries))
	}

	// Test value model paths
	paths := idx.GetAllValueModelPaths()
	t.Logf("Value model paths targeted by KRs: %d", len(paths))
	for _, path := range paths {
		entries := idx.ByValueModelPath[path]
		t.Logf("  - %s: %d KRs", path, len(entries))
	}
}

func TestRoadmapIntegration_KRsWithValueModelTargets(t *testing.T) {
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Test instance not found")
	}

	loader := roadmap.NewLoader(instancePath)
	rm, err := loader.Load()
	if err != nil {
		t.Fatalf("Failed to load roadmap: %v", err)
	}

	krsWithTargets := rm.GetKRsWithValueModelTargets()
	t.Logf("KRs with value_model_target: %d", len(krsWithTargets))

	for _, kr := range krsWithTargets {
		if kr.ValueModelTarget != nil {
			t.Logf("  - %s targets %s.%s (maturity: %s)",
				kr.ID,
				kr.ValueModelTarget.Track,
				kr.ValueModelTarget.ComponentPath,
				kr.ValueModelTarget.TargetMaturity)
		}
	}
}

func TestRoadmapIntegration_GetKR(t *testing.T) {
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Test instance not found")
	}

	loader := roadmap.NewLoader(instancePath)
	rm, err := loader.Load()
	if err != nil {
		t.Fatalf("Failed to load roadmap: %v", err)
	}

	// Try to get a known KR (from the sample we saw)
	kr, track, found := rm.GetKR("kr-p-001")
	if !found {
		t.Log("kr-p-001 not found (may not exist in this instance)")
	} else {
		t.Logf("Found kr-p-001 in %s track: %s", track, truncate(kr.Description, 60))
	}

	// Get all KRs and verify we can retrieve each one
	allKRs := rm.GetAllKRs()
	for _, kr := range allKRs {
		retrieved, track, found := rm.GetKR(kr.ID)
		if !found {
			t.Errorf("Failed to retrieve KR %s", kr.ID)
		} else if retrieved.ID != kr.ID {
			t.Errorf("Retrieved wrong KR: got %s, want %s", retrieved.ID, kr.ID)
		} else if track == "" {
			t.Errorf("Track is empty for KR %s", kr.ID)
		}
	}
	t.Logf("Successfully retrieved all %d KRs", len(allKRs))
}

// truncate shortens a string to the given length
func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}
