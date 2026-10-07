package mcpserver_test

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestAllInstanceToolsCheckAccess is a structural guard against the tenant
// isolation gap: an MCP tool that accepts an instance_id must verify the
// caller may access that instance before doing anything with it.
//
// instance_id arrives as an untrusted tool argument. Without a check, any
// authenticated caller holding any instance UUID reads another tenant's
// strategy. That was the state of 100+ handlers before this test existed.
//
// # Why static analysis rather than calling the tools
//
// The obvious test — call every tool as a non-member and assert forbidden —
// cannot work here. Tool handlers are closures over domain services, and the
// only way to build a full server without a database is
// NewMCPServerForIntrospection, which supplies zero-valued services whose db
// field is nil. Any handler reaching a query panics on nil pointer dereference
// before authorisation could be observed. Driving the tools for real would
// need a live Postgres plus seeded orgs, users, instances and memberships for
// all 159 tools, which is an integration suite, not a guard rail.
//
// So this test parses the registration source instead and asserts the call is
// present. That is weaker — it proves the call exists, not that it runs on
// every path — but it is deterministic, fast, needs no fixtures, and catches
// the thing that actually regresses: someone adds a tool and forgets the
// check. Behavioural proof that the check denies correctly lives in the unit
// tests for assertInstanceAccess itself.
func TestAllInstanceToolsCheckAccess(t *testing.T) {
	files, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatalf("glob: %v", err)
	}

	type finding struct {
		file string
		tool string
		line int
	}
	var unchecked []finding
	total := 0

	for _, file := range files {
		if strings.HasSuffix(file, "_test.go") {
			continue
		}

		src, err := os.ReadFile(file)
		if err != nil {
			t.Fatalf("read %s: %v", file, err)
		}

		fset := token.NewFileSet()
		f, err := parser.ParseFile(fset, file, src, 0)
		if err != nil {
			t.Fatalf("parse %s: %v", file, err)
		}

		ast.Inspect(f, func(n ast.Node) bool {
			call, ok := n.(*ast.CallExpr)
			if !ok || !isAddToolCall(call) || len(call.Args) < 2 {
				return true
			}

			name, requiresInstance := toolNameAndInstanceArg(call.Args[0])
			if name == "" {
				return true
			}
			if !requiresInstance {
				// Tools taking no instance_id have no instance to
				// authorise against. Session-scoped tools such as
				// set_tool_filter live here deliberately.
				return true
			}

			total++
			if !bodyAssertsAccess(call.Args[1]) {
				unchecked = append(unchecked, finding{
					file: file,
					tool: name,
					line: fset.Position(call.Pos()).Line,
				})
			}
			return true
		})
	}

	if total == 0 {
		t.Fatal("found no tools requiring instance_id — the AST matcher is broken, " +
			"not the codebase; check isAddToolCall and toolNameAndInstanceArg")
	}

	if len(unchecked) > 0 {
		t.Errorf("%d of %d instance-scoped tools do not call assertInstanceAccess "+
			"(or an equivalent guard). Each one lets any authenticated caller read or "+
			"mutate an instance belonging to another tenant by passing its UUID:",
			len(unchecked), total)
		for _, u := range unchecked {
			t.Errorf("  %s:%d  %s", u.file, u.line, u.tool)
		}
	}
}

// isAddToolCall reports whether the call is x.AddTool(...).
func isAddToolCall(call *ast.CallExpr) bool {
	sel, ok := call.Fun.(*ast.SelectorExpr)
	return ok && sel.Sel.Name == "AddTool"
}

// toolNameAndInstanceArg extracts the tool name from an mcp.NewTool(...)
// expression and reports whether it declares a required instance_id parameter.
//
// Required is the operative word: a tool with an optional instance_id filter
// (list_workspaces, say) is not necessarily instance-scoped, and forcing a
// check there would deny legitimate unscoped listing.
func toolNameAndInstanceArg(arg ast.Expr) (name string, requiresInstance bool) {
	newTool, ok := arg.(*ast.CallExpr)
	if !ok || !isNewToolCall(newTool) || len(newTool.Args) == 0 {
		return "", false
	}

	lit, ok := newTool.Args[0].(*ast.BasicLit)
	if !ok || lit.Kind != token.STRING {
		return "", false
	}
	name = strings.Trim(lit.Value, `"`)

	for _, opt := range newTool.Args[1:] {
		optCall, ok := opt.(*ast.CallExpr)
		if !ok {
			continue
		}
		sel, ok := optCall.Fun.(*ast.SelectorExpr)
		if !ok || sel.Sel.Name != "WithString" {
			continue
		}
		if len(optCall.Args) == 0 {
			continue
		}
		argLit, ok := optCall.Args[0].(*ast.BasicLit)
		if !ok || strings.Trim(argLit.Value, `"`) != "instance_id" {
			continue
		}
		for _, sub := range optCall.Args[1:] {
			if subCall, ok := sub.(*ast.CallExpr); ok {
				if subSel, ok := subCall.Fun.(*ast.SelectorExpr); ok && subSel.Sel.Name == "Required" {
					return name, true
				}
			}
		}
	}
	return name, false
}

func isNewToolCall(call *ast.CallExpr) bool {
	sel, ok := call.Fun.(*ast.SelectorExpr)
	return ok && sel.Sel.Name == "NewTool"
}

// guardingHelpers are helpers that perform the access check themselves. A
// handler whose whole body delegates to one of these is guarded, even though
// the assert call does not appear in the handler.
//
// Keep this list short and verify each entry actually asserts — an incorrect
// entry here silently exempts every caller.
var guardingHelpers = map[string]bool{
	"stageArtifact":         true,
	"transitionWorkPackage": true,
}

// bodyAssertsAccess reports whether the handler guards access, either directly
// or by delegating to a helper that does.
//
// Deliberately permissive about which guard: some handlers resolve a workspace
// rather than an instance. Requiring one exact call would produce false
// positives and pressure people into the wrong shape.
func bodyAssertsAccess(handler ast.Expr) bool {
	fn, ok := handler.(*ast.FuncLit)
	if !ok {
		return false
	}
	found := false
	ast.Inspect(fn.Body, func(n ast.Node) bool {
		ident, ok := n.(*ast.Ident)
		if !ok {
			return true
		}
		if guardingHelpers[ident.Name] {
			found = true
			return false
		}
		switch ident.Name {
		case "assertInstanceAccess", "assertWorkspaceAccess", "assertInstanceWrite":
			found = true
			return false
		}
		return true
	})
	return found
}
