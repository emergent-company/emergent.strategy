package navigation

import "testing"

func TestDefaultGraph_Validates(t *testing.T) {
	g := DefaultGraph()
	errs := g.Validate()
	for _, e := range errs {
		if e.Level == "error" {
			t.Errorf("graph validation error: %s", e.Message)
		} else {
			t.Logf("graph validation warning: %s", e.Message)
		}
	}
}

func TestDefaultGraph_NoDuplicateScreenIDs(t *testing.T) {
	g := DefaultGraph()
	seen := make(map[ScreenID]bool)
	for _, s := range g.Screens {
		if seen[s.ID] {
			t.Errorf("duplicate screen ID: %s", s.ID)
		}
		seen[s.ID] = true
	}
}

func TestDefaultGraph_AllTabGroupsHaveLanding(t *testing.T) {
	g := DefaultGraph()
	tabs := g.InstanceTabGroups()
	for _, tab := range tabs {
		found := false
		for _, s := range g.Screens {
			if s.TabGroup == tab && s.RenderMode == RenderTabLanding {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("tab %q has no landing screen", tab)
		}
	}
}

func TestBreadcrumbChain(t *testing.T) {
	g := DefaultGraph()

	chain := g.BreadcrumbChain(FeatureDetail, "abc-123")
	if len(chain) == 0 {
		t.Fatal("expected breadcrumb chain for FeatureDetail")
	}

	// Should be: Dashboard > Execution > FIRE > Features > Feature
	labels := make([]string, len(chain))
	for i, e := range chain {
		labels[i] = e.Label
	}
	t.Logf("breadcrumb chain: %v", labels)

	if labels[0] != "Dashboard" {
		t.Errorf("first crumb should be Dashboard, got %q", labels[0])
	}
	if chain[len(chain)-1].Href != "" {
		t.Errorf("last crumb should have empty href, got %q", chain[len(chain)-1].Href)
	}
}

func TestResolveTabForPath(t *testing.T) {
	g := DefaultGraph()
	instanceID := "abc-123"

	tests := []struct {
		path     string
		expected TabGroup
	}{
		{"/strategies/abc-123", TabExecution},
		{"/strategies/abc-123/ready", TabReady},
		{"/strategies/abc-123/ready/north-star", TabReady},
		{"/strategies/abc-123/fire", TabFire},
		{"/strategies/abc-123/fire/features", TabFire},
		{"/strategies/abc-123/fire/features/fd-001", TabFire},
		{"/strategies/abc-123/fire/definitions/sd-001", TabFire},
		{"/strategies/abc-123/aim", TabAim},
		{"/strategies/abc-123/aim/lra", TabAim},
	}

	for _, tt := range tests {
		got := g.ResolveTabForPath(instanceID, tt.path)
		if got != tt.expected {
			t.Errorf("ResolveTabForPath(%q) = %q, want %q", tt.path, got, tt.expected)
		}
	}
}

func TestTabSubNavScreens(t *testing.T) {
	g := DefaultGraph()

	// FIRE tab should have sub-nav items (Features, Value Models, tracks)
	// but NOT detail views (FeatureDetail, ValueModelDetail, DefinitionDetail)
	fireSubNav := g.TabSubNavScreens(TabFire)
	if len(fireSubNav) == 0 {
		t.Fatal("expected FIRE tab sub-nav screens")
	}

	for _, s := range fireSubNav {
		if s.SubNavHidden {
			t.Errorf("sub-nav should not include hidden screen %q", s.ID)
		}
		if s.RenderMode != RenderTabPage {
			t.Errorf("sub-nav screen %q should be RenderTabPage, got %q", s.ID, s.RenderMode)
		}
	}

	// Verify specific screens are included
	ids := make(map[ScreenID]bool)
	for _, s := range fireSubNav {
		ids[s.ID] = true
	}
	for _, expected := range []ScreenID{ProductTrack, CommercialTrack, StrategyTrack, OrgOpsTrack} {
		if !ids[expected] {
			t.Errorf("FIRE sub-nav missing %q", expected)
		}
	}
	for _, excluded := range []ScreenID{FeatureDetail, ValueModelDetail, DefinitionDetail} {
		if ids[excluded] {
			t.Errorf("FIRE sub-nav should not include %q", excluded)
		}
	}
}
