package semantic_test

import (
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"
)

const (
	memoryImport = "github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory"
	serverRoot   = "../.."
)

// mayUseMemory are the places allowed to talk to Memory. Everything else reads
// through domain/semantic, which scopes every read to one instance. The orphan
// sweep lives in domain/ingest and is run by cmd_memory.go, so both are covered
// by the entries below.
func mayUseMemory(rel string) bool {
	switch {
	case strings.HasPrefix(rel, "domain/semantic/"),
		strings.HasPrefix(rel, "domain/ingest/"),
		strings.HasPrefix(rel, "internal/memory/"):
		return true
	case !strings.Contains(rel, "/") && strings.HasPrefix(rel, "cmd_"):
		return true // commands wire the clients and run the fenced ingest
	}
	return false
}

type goFile struct {
	rel  string
	file *ast.File
	fset *token.FileSet
}

func productionFiles(t *testing.T) []goFile {
	t.Helper()
	var out []goFile
	err := filepath.WalkDir(serverRoot, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			switch d.Name() {
			case "node_modules", "vendor", ".git":
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		fset := token.NewFileSet()
		f, perr := parser.ParseFile(fset, path, nil, 0)
		if perr != nil {
			return perr
		}
		rel, _ := filepath.Rel(serverRoot, path)
		out = append(out, goFile{rel: filepath.ToSlash(rel), file: f, fset: fset})
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(out) < 100 {
		t.Fatalf("found only %d production files under %s; the walk is not seeing the tree", len(out), serverRoot)
	}
	return out
}

func importsMemory(f *ast.File) bool {
	for _, imp := range f.Imports {
		if p, _ := strconv.Unquote(imp.Path.Value); p == memoryImport {
			return true
		}
	}
	return false
}

// 3.8: no package outside the scoped read path imports the Memory client or
// reaches it through the semantic service.
func TestArchitecture_OnlyTheScopedReadPathTalksToMemory(t *testing.T) {
	var offenders []string
	for _, f := range productionFiles(t) {
		if mayUseMemory(f.rel) {
			continue
		}
		if importsMemory(f.file) {
			offenders = append(offenders, f.rel+": imports internal/memory")
		}
		ast.Inspect(f.file, func(n ast.Node) bool {
			call, ok := n.(*ast.CallExpr)
			if !ok {
				return true
			}
			sel, ok := call.Fun.(*ast.SelectorExpr)
			if !ok {
				return true
			}
			if sel.Sel.Name == "Client" && len(call.Args) == 0 {
				if inner, ok := sel.X.(*ast.SelectorExpr); ok && strings.Contains(strings.ToLower(inner.Sel.Name), "semantic") {
					offenders = append(offenders, f.rel+":"+strconv.Itoa(f.fset.Position(call.Pos()).Line)+": takes the raw Memory client from the semantic service")
				}
			}
			return true
		})
	}
	sort.Strings(offenders)
	if len(offenders) > 0 {
		t.Errorf("%d places reach Memory without going through domain/semantic:\n  %s", len(offenders), strings.Join(offenders, "\n  "))
	}
}

// 3.8: every Search request names the instance label, so a search can never be
// project-wide. The count of exactly one is asserted at run time in the
// isolation tests.
func TestArchitecture_EverySearchRequestSetsLabels(t *testing.T) {
	var seen int
	var offenders []string
	for _, f := range productionFiles(t) {
		if !importsMemory(f.file) || strings.HasPrefix(f.rel, "internal/memory/") {
			continue
		}
		ast.Inspect(f.file, func(n ast.Node) bool {
			lit, ok := n.(*ast.CompositeLit)
			if !ok {
				return true
			}
			sel, ok := lit.Type.(*ast.SelectorExpr)
			if !ok || sel.Sel.Name != "SearchRequest" {
				return true
			}
			seen++
			hasLabels := false
			for _, el := range lit.Elts {
				if kv, ok := el.(*ast.KeyValueExpr); ok {
					if id, ok := kv.Key.(*ast.Ident); ok && id.Name == "Labels" {
						hasLabels = true
					}
				}
			}
			if !hasLabels {
				offenders = append(offenders, f.rel+":"+strconv.Itoa(f.fset.Position(lit.Pos()).Line))
			}
			return true
		})
	}
	if seen == 0 {
		t.Fatal("found no SearchRequest literal; the check is looking in the wrong place")
	}
	if len(offenders) > 0 {
		t.Errorf("SearchRequest without Labels (a project-wide search): %v", offenders)
	}
}
