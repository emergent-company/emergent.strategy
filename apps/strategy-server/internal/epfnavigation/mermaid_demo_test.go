package navigation

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// TestGenerateMermaidDemos generates Mermaid diagram files for visual review.
// Run with: go test -run TestGenerateMermaidDemos -v
func TestGenerateMermaidDemos(t *testing.T) {
	outDir := os.Getenv("MERMAID_OUTPUT_DIR")
	if outDir == "" {
		// Default: repo root
		_, filename, _, _ := runtime.Caller(0)
		outDir = filepath.Join(filepath.Dir(filename), "..", "..", "..", "..")
	}

	var md string

	// ── 1. Composition: Platform + Captable ──────────────────────
	root, err := LoadFile(testdataPath("composition/platform.yaml"))
	if err != nil {
		t.Fatalf("LoadFile platform: %v", err)
	}
	composed, err := Compose(root, testdataPath("composition"))
	if err != nil {
		t.Fatalf("Compose: %v", err)
	}
	md += "# Navigation Graph Demo: Mermaid Diagrams\n\n"
	md += "## 1. Multi-Service Composition\n\n"
	md += "**Twenty First Platform** imports the **Cap Table** service.\n"
	md += "Portal edges (dashed lines) connect contexts across service boundaries.\n\n"
	md += "```mermaid\n"
	md += ToMermaidComposed(composed, nil)
	md += "```\n\n"

	// ── 2. 21st-captable: Captable group ─────────────────────────
	captable, err := LoadFile(testdataPath("21st_captable_navigation.yaml"))
	if err != nil {
		t.Fatalf("LoadFile captable: %v", err)
	}
	md += "## 2. 21st-captable: Cap Table Group (LR layout)\n\n"
	md += "Only the captable tab group — 21 contexts with guard annotations.\n\n"
	md += "```mermaid\n"
	md += captable.ToMermaid(&MermaidOptions{
		Group:      "captable",
		ShowGuards: true,
		Direction:  "LR",
	})
	md += "```\n\n"

	// ── 3. Full-access reachability ──────────────────────────────
	fullProfile := NewGuardProfile()
	for _, g := range []string{"company-exists", "share-classes", "shares-exist", "shares-allowed", "premium-tier", "instrument-at-cursor"} {
		fullProfile.Guards[g] = true
	}
	md += "## 3. 21st-captable: Full Access Reachability\n\n"
	md += "**Green** = reachable with all guards satisfied (109 of 115 contexts).\n"
	md += "**Red** = blocked (6 contexts unreachable even with full access — entry point not connected).\n\n"
	md += "Shown with tab-group subgraphs.\n\n"
	md += "```mermaid\n"
	md += captable.ToMermaid(&MermaidOptions{
		Profile:    fullProfile,
		ShowGroups: true,
	})
	md += "```\n\n"

	// ── 4. Member-only reachability ──────────────────────────────
	memberProfile := NewGuardProfile()
	memberProfile.Guards["company-exists"] = true
	memberProfile.Guards["members-allowed"] = true
	md += "## 4. 21st-captable: Member (Cooperative) Reachability\n\n"
	md += "Members of SA/BRL organizations get `company-exists` + `members-allowed`.\n"
	md += "They **cannot** access shareholder-specific features (`shares-allowed` blocked).\n\n"
	md += "**Green** = reachable, **Red** = blocked by guards.\n\n"
	md += "```mermaid\n"
	md += captable.ToMermaid(&MermaidOptions{
		Profile:    memberProfile,
		ShowGroups: true,
	})
	md += "```\n\n"

	// ── 5. Minimal profile (no company) ──────────────────────────
	minProfile := NewGuardProfile()
	md += "## 5. 21st-captable: Unauthenticated / No Company Selected\n\n"
	md += "No guards satisfied — only root-level screens are reachable.\n\n"
	md += "```mermaid\n"
	md += captable.ToMermaid(&MermaidOptions{
		Profile:    minProfile,
		ShowGroups: true,
	})
	md += "```\n\n"

	// ── 6. Emergent Strategy platform ────────────────────────────
	// The emergent platform nav graph is in the EPF instance, not testdata
	_, filename, _, _ := runtime.Caller(0)
	emergentPath := filepath.Join(filepath.Dir(filename), "..", "..", "..", "..", "docs", "EPF", "_instances", "emergent", "FIRE", "navigation_graph.yaml")
	emergent, err := LoadFile(emergentPath)
	if err != nil {
		t.Logf("Note: emergent platform graph not found, skipping: %v", err)
	} else {
		strategist := NewGuardProfile()
		for _, g := range []string{"authenticated", "instance-active", "can-write", "can-admin", "memory-connected"} {
			strategist.Guards[g] = true
		}
		for _, gg := range []string{"semantic-engine", "premium"} {
			strategist.GuardGroups[gg] = true
		}
		md += "## 6. Emergent Strategy Platform: Strategist View\n\n"
		md += "Full access strategist with all guards and guard groups satisfied.\n\n"
		md += "```mermaid\n"
		md += emergent.ToMermaid(&MermaidOptions{
			Profile:    strategist,
			ShowGroups: true,
			ShowGuards: true,
		})
		md += "```\n\n"

		observer := NewGuardProfile()
		observer.Guards["authenticated"] = true
		observer.Guards["instance-active"] = true
		md += "## 7. Emergent Strategy Platform: Observer View\n\n"
		md += "Observer with `authenticated` + `instance-active` only. Cannot write or access semantic engine.\n\n"
		md += "```mermaid\n"
		md += emergent.ToMermaid(&MermaidOptions{
			Profile:    observer,
			ShowGroups: true,
			ShowGuards: true,
		})
		md += "```\n\n"
	}

	// Write to file
	outPath := outDir + "/navigation_demo.md"
	if err := os.WriteFile(outPath, []byte(md), 0644); err != nil {
		t.Fatalf("write demo file: %v", err)
	}
	t.Logf("Demo file written to: %s", outPath)
	t.Logf("Open in VS Code or view on GitHub to render Mermaid diagrams")
}
