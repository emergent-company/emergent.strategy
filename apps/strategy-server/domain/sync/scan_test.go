package sync

import (
	"testing"
)

// TestAnnotateSubmoduleSubscribers verifies the post-scan cross-referencing pass
// that populates UsedByRepos on EPF repo cards.
func TestAnnotateSubmoduleSubscribers(t *testing.T) {
	// 21st-epf is the canonical EPF repo. twentyfirst and 21st-captable are subscribers.
	results := []RepoScanResult{
		{
			FullName: "eyedea-io/21st-epf",
			HasEPF:   true,
		},
		{
			FullName: "eyedea-io/twentyfirst",
			SubmoduleRefs: []SubmoduleRef{
				{Path: "docs/EPF", URL: "git@github.com:eyedea-io/21st-epf.git", RepoSlug: "eyedea-io/21st-epf"},
			},
		},
		{
			FullName: "eyedea-io/21st-captable",
			SubmoduleRefs: []SubmoduleRef{
				{Path: "docs/EPF", URL: "git@github.com:eyedea-io/21st-epf.git", RepoSlug: "eyedea-io/21st-epf"},
			},
		},
		{
			FullName: "eyedea-io/unrelated",
		},
	}

	annotateSubmoduleSubscribers(results)

	// Find 21st-epf result.
	var epfResult RepoScanResult
	for _, r := range results {
		if r.FullName == "eyedea-io/21st-epf" {
			epfResult = r
			break
		}
	}

	if len(epfResult.UsedByRepos) != 2 {
		t.Fatalf("want 2 UsedByRepos, got %d: %v", len(epfResult.UsedByRepos), epfResult.UsedByRepos)
	}
	usedBy := map[string]bool{}
	for _, u := range epfResult.UsedByRepos {
		usedBy[u] = true
	}
	if !usedBy["eyedea-io/twentyfirst"] {
		t.Error("want eyedea-io/twentyfirst in UsedByRepos")
	}
	if !usedBy["eyedea-io/21st-captable"] {
		t.Error("want eyedea-io/21st-captable in UsedByRepos")
	}

	// Unrelated repo should not be annotated.
	for _, r := range results {
		if r.FullName == "eyedea-io/unrelated" && len(r.UsedByRepos) > 0 {
			t.Errorf("unrelated repo should have no UsedByRepos, got %v", r.UsedByRepos)
		}
	}
}

// TestAnnotateSubmoduleSubscribers_NoMatch verifies no panic or mutation when
// submodule slugs don't match any repo in the scan.
func TestAnnotateSubmoduleSubscribers_NoMatch(t *testing.T) {
	results := []RepoScanResult{
		{
			FullName: "org/repo-a",
			SubmoduleRefs: []SubmoduleRef{
				{RepoSlug: "org/not-in-scan"},
			},
		},
		{FullName: "org/repo-b"},
	}
	annotateSubmoduleSubscribers(results)
	for _, r := range results {
		if len(r.UsedByRepos) > 0 {
			t.Errorf("repo %q should have no UsedByRepos, got %v", r.FullName, r.UsedByRepos)
		}
	}
}
