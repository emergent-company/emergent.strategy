package decompose_test

import (
	"os"
	"path/filepath"
	"sort"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategyread"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/decompose"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/epfimport"
)

// artifactTypes are the artifacts whose key is also their type, which is what
// get_section needs to read them.
var artifactTypes = map[string]bool{
	"north_star": true, "insight_analyses": true, "insight_opportunity": true,
	"strategy_foundations": true, "strategy_formula": true, "roadmap_recipe": true,
}

// A decomposed object tells the reader where in its source artifact it came
// from, in section_path. The search hit offers that path to get_section as
// read_with, and withholds read_with when the path does not resolve, leaving the
// hit as a truncated snippet with no way to the text. So every section_path must
// be a path get_section accepts and finds in the stored artifact.
func assertSectionPathsResolve(t *testing.T, instancePath string, wantTypes ...string) {
	t.Helper()
	result, err := decompose.New(instancePath).DecomposeInstance()
	if err != nil {
		t.Fatalf("decompose: %v", err)
	}

	parsed := map[string]any{}
	checked := map[string]int{}
	failed := map[string][]string{}
	for _, o := range result.Objects {
		sp, _ := o.Properties["section_path"].(string)
		src, _ := o.Properties["source_artifact"].(string)
		if sp == "" || src == "" {
			continue
		}
		key := epfimport.ArtifactKey(src, filepath.Base(src))
		if !artifactTypes[key] {
			continue
		}
		payload, ok := payloadOf(t, instancePath, src, key, parsed)
		if !ok {
			continue
		}
		checked[o.Type]++
		slice, err := strategyread.Read(key, payload, sp, 1)
		if err != nil || !slice.Defined {
			failed[o.Type] = append(failed[o.Type], key+": "+sp)
		}
	}

	var types []string
	for typ := range failed {
		types = append(types, typ)
	}
	sort.Strings(types)
	for _, typ := range types {
		t.Errorf("%s: %d of %d section paths do not resolve with get_section, e.g. %s",
			typ, len(failed[typ]), checked[typ], failed[typ][0])
	}
	for _, typ := range wantTypes {
		if checked[typ] == 0 {
			t.Errorf("no %s with a section path was checked: the fixture no longer covers it", typ)
		}
	}
}

// payloadOf is the stored payload of the file a decomposed object came from.
// It parses that one file instead of scanning the directory: two files can map
// to one artifact key (#119), and the scan then keeps either, from run to run.
func payloadOf(t *testing.T, instancePath, src, key string, cache map[string]any) (any, bool) {
	t.Helper()
	if p, ok := cache[src]; ok {
		return p, true
	}
	raw, err := os.ReadFile(filepath.Join(instancePath, src))
	if err != nil {
		return nil, false
	}
	payloads, _, err := epfimport.ParseFiles(map[string][]byte{src: raw})
	if err != nil {
		t.Fatalf("parse %s: %v", src, err)
	}
	p, ok := payloads[key]
	if ok {
		cache[src] = p
	}
	return p, ok
}

func TestSectionPaths_ResolveInTheTestdataInstance(t *testing.T) {
	assertSectionPathsResolve(t, "testdata", "Assumption", "Belief")
}

func TestSectionPaths_ResolveInTheEmergentInstance(t *testing.T) {
	for _, p := range []string{
		filepath.Join("..", "..", "..", "..", "docs", "EPF", "_instances", "emergent"),
	} {
		abs, _ := filepath.Abs(p)
		if _, err := os.Stat(filepath.Join(abs, "READY", "00_north_star.yaml")); err == nil {
			assertSectionPathsResolve(t, abs, "Assumption", "PainPoint", "OKR", "Persona")
			return
		}
	}
	t.Skip("emergent EPF instance not available")
}
