package mcpserver_test

// pack_test.go — Phase I integration tests for the skill pack system and app platform.
//
// Tests I.1–I.22 per openspec/changes/add-skill-pack-system/tasks.md.
//
// Run with:
//
//	PGPORT=5433 go test ./internal/mcpserver/... -run TestMCP_Skill -v
//	PGPORT=5433 go test ./internal/mcpserver/... -run TestMCP_App -v

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	appdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/app"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/mcpserver"
)

// ---------------------------------------------------------------------------
// Pack-test helpers
// ---------------------------------------------------------------------------

// minimalPackYAML returns a pack.yaml for a pack with the given name and version.
func minimalPackYAML(packName, version string) string {
	return fmt.Sprintf(
		"name: %s\nversion: %q\ndescription: \"test pack\"\nauthor: \"\"\ntrusted: false\n",
		packName, version,
	)
}

// promptSkillYAML returns a minimal prompt-mode skill.yaml.
func promptSkillYAML(name string) string {
	return fmt.Sprintf(
		"name: %s\nversion: \"1.0.0\"\ntype: creation\nphase: FIRE\ndescription: \"A test skill\"\nexecution: prompt\n",
		name,
	)
}

// scriptSkillYAML returns a minimal script-mode skill.yaml.
func scriptSkillYAML(name, lang string) string {
	return fmt.Sprintf(
		"name: %s\nversion: \"1.0.0\"\ntype: analysis\nphase: FIRE\ndescription: \"A test script skill\"\nexecution: script\nscript_lang: %s\n",
		name, lang,
	)
}

// skillsJSONArray marshals skill bundle maps to the JSON array install_pack expects.
func skillsJSONArray(bundles ...map[string]any) string {
	b, _ := json.Marshal(bundles)
	return string(b)
}

// packTestAuditCtx returns a context with audit source=system.
func packTestAuditCtx() context.Context {
	ctx := context.Background()
	ctx = audit.ContextWithSource(ctx, audit.SourceSystem)
	ctx = audit.ContextWithAudit(ctx, audit.NewSlogWriter())
	return ctx
}

// packTestAppSvc returns an app.Service backed by the same DB as svc.
func packTestAppSvc(t *testing.T, svc mcpserver.Services) *appdom.Service {
	t.Helper()
	return appdom.NewService(svc.Strategy.DB())
}

// ---------------------------------------------------------------------------
// I.1 — install a minimal prompt-mode pack; verify list_packs + list_installed_skills
// ---------------------------------------------------------------------------

func TestMCP_SkillPackInstallAndList(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "org-pack-install", nil)

	packYAML := minimalPackYAML("my-test-pack", "1.0.0")
	skillYAML := promptSkillYAML("my-test-skill")
	skills := skillsJSONArray(map[string]any{
		"name":       "my-test-skill",
		"skill_yaml": skillYAML,
		"prompt_md":  "# My Test Skill\n\nDo something.",
	})

	var installed map[string]any
	c.call(id, "install_pack", map[string]any{
		"instance_id": instID.String(),
		"pack_yaml":   packYAML,
		"skills":      skills,
	}).assertOK().decode(&installed)
	id++

	if installed["installed"] != true {
		t.Errorf("install_pack: installed=%v, want true", installed["installed"])
	}
	if installed["pack_name"] != "my-test-pack" {
		t.Errorf("install_pack: pack_name=%v, want my-test-pack", installed["pack_name"])
	}

	// list_packs should include my-test-pack.
	var packs []map[string]any
	c.call(id, "list_packs", map[string]any{"instance_id": instID.String()}).
		assertOK().decode(&packs)
	id++

	packFound := false
	for _, p := range packs {
		if p["pack_name"] == "my-test-pack" {
			packFound = true
		}
	}
	if !packFound {
		t.Errorf("list_packs: my-test-pack not found in %v", packs)
	}

	// list_installed_skills should include my-test-skill with source: installed.
	var skillList []map[string]any
	c.call(id, "list_installed_skills", map[string]any{"instance_id": instID.String()}).
		assertOK().decode(&skillList)
	id++

	skillFound := false
	for _, sk := range skillList {
		if sk["skill_name"] == "my-test-skill" && sk["source"] == "installed" {
			skillFound = true
		}
	}
	if !skillFound {
		t.Errorf("list_installed_skills: my-test-skill with source=installed not found")
	}
	_ = id
}

// ---------------------------------------------------------------------------
// I.2 — install a pack shadowing a canonical skill; verify installed version returned
// ---------------------------------------------------------------------------

func TestMCP_SkillPackResolutionPrecedence(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "org-precedence", nil)

	// "feature-creator" is a canonical skill — shadow it with an installed version.
	canonicalName := "feature-creator"
	packYAML := minimalPackYAML("shadow-pack", "1.0.0")
	shadowYAML := fmt.Sprintf(
		"name: %s\nversion: \"2.0.0\"\ntype: creation\nphase: FIRE\ndescription: \"Shadowing canonical\"\nexecution: prompt\n",
		canonicalName,
	)
	overridePrompt := "# Shadowed Feature Creator\n\nCustom version."
	skills := skillsJSONArray(map[string]any{
		"name":       canonicalName,
		"skill_yaml": shadowYAML,
		"prompt_md":  overridePrompt,
	})

	c.call(id, "install_pack", map[string]any{
		"instance_id": instID.String(),
		"pack_yaml":   packYAML,
		"skills":      skills,
	}).assertOK()
	id++

	var resolved map[string]any
	c.call(id, "get_installed_skill", map[string]any{
		"instance_id": instID.String(),
		"skill_name":  canonicalName,
	}).assertOK().decode(&resolved)
	id++

	if resolved["source"] != "installed" {
		t.Errorf("get_installed_skill: source=%v, want installed", resolved["source"])
	}
	if !strings.Contains(fmt.Sprintf("%v", resolved["prompt_md"]), "Shadowed Feature Creator") {
		t.Errorf("get_installed_skill: expected shadowed prompt_md, got %v", resolved["prompt_md"])
	}
	_ = id
}

// ---------------------------------------------------------------------------
// I.3 — run_skill returns prompt_md for a prompt-mode skill
// ---------------------------------------------------------------------------

func TestMCP_SkillPackRunPromptMode(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "org-run-prompt", nil)

	packYAML := minimalPackYAML("run-prompt-pack", "1.0.0")
	skillYAML := promptSkillYAML("run-prompt-skill")
	skills := skillsJSONArray(map[string]any{
		"name":       "run-prompt-skill",
		"skill_yaml": skillYAML,
		"prompt_md":  "# Run Prompt Skill\n\nThis is the prompt body.",
	})
	c.call(id, "install_pack", map[string]any{
		"instance_id": instID.String(),
		"pack_yaml":   packYAML,
		"skills":      skills,
	}).assertOK()
	id++

	var result map[string]any
	c.call(id, "run_skill", map[string]any{
		"instance_id": instID.String(),
		"skill_name":  "run-prompt-skill",
	}).assertOK().decode(&result)
	id++

	if result["mode"] != "prompt" {
		t.Errorf("run_skill: mode=%v, want prompt", result["mode"])
	}
	if !strings.Contains(fmt.Sprintf("%v", result["prompt_md"]), "Run Prompt Skill") {
		t.Errorf("run_skill: prompt_md missing expected content; got %v", result["prompt_md"])
	}
	_ = id
}

// ---------------------------------------------------------------------------
// I.4 — run_skill executes a bash script and returns artifact count
// ---------------------------------------------------------------------------

func TestMCP_SkillPackRunScriptMode(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "org-run-script", map[string]any{
		"north_star": map[string]string{"vision": "test"},
	})

	packYAML := minimalPackYAML("script-pack", "1.0.0")
	skillYAML := scriptSkillYAML("count-skill", "sh")
	// Script reads stdin JSON, counts artifacts, writes JSON to stdout.
	scriptSrc := `#!/bin/sh
input=$(cat)
count=$(echo "$input" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('artifacts', [])))" 2>/dev/null || echo "0")
printf '{"output":"artifact_count=%s","format":"text"}' "$count"
`
	skills := skillsJSONArray(map[string]any{
		"name":        "count-skill",
		"skill_yaml":  skillYAML,
		"script_src":  scriptSrc,
		"script_lang": "sh",
	})
	c.call(id, "install_pack", map[string]any{
		"instance_id": instID.String(),
		"pack_yaml":   packYAML,
		"skills":      skills,
	}).assertOK()
	id++

	var result map[string]any
	c.call(id, "run_skill", map[string]any{
		"instance_id": instID.String(),
		"skill_name":  "count-skill",
	}).assertOK().decode(&result)
	id++

	if result["mode"] != "script" {
		t.Errorf("run_skill script: mode=%v, want script", result["mode"])
	}
	output := fmt.Sprintf("%v", result["output"])
	if !strings.Contains(output, "artifact_count=") {
		t.Errorf("run_skill script: expected artifact_count in output, got %q", output)
	}
	_ = id
}

// ---------------------------------------------------------------------------
// I.5 — install then uninstall; verify novel skill disappears
// ---------------------------------------------------------------------------

func TestMCP_SkillPackUninstall(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "org-uninstall", nil)

	packYAML := minimalPackYAML("uninstall-pack", "1.0.0")
	skillYAML := promptSkillYAML("novel-skill-xyz")
	skills := skillsJSONArray(map[string]any{
		"name":       "novel-skill-xyz",
		"skill_yaml": skillYAML,
	})
	c.call(id, "install_pack", map[string]any{
		"instance_id": instID.String(),
		"pack_yaml":   packYAML,
		"skills":      skills,
	}).assertOK()
	id++

	// Confirm installed.
	var beforeList []map[string]any
	c.call(id, "list_installed_skills", map[string]any{"instance_id": instID.String()}).
		assertOK().decode(&beforeList)
	id++
	foundBefore := false
	for _, sk := range beforeList {
		if sk["skill_name"] == "novel-skill-xyz" && sk["source"] == "installed" {
			foundBefore = true
		}
	}
	if !foundBefore {
		t.Fatal("novel-skill-xyz not found before uninstall")
	}

	// Uninstall.
	var uninstResult map[string]any
	c.call(id, "uninstall_pack", map[string]any{
		"instance_id": instID.String(),
		"pack_name":   "uninstall-pack",
	}).assertOK().decode(&uninstResult)
	id++

	if uninstResult["uninstalled"] != true {
		t.Errorf("uninstall_pack: uninstalled=%v, want true", uninstResult["uninstalled"])
	}

	// Verify skill no longer listed with source=installed.
	var afterList []map[string]any
	c.call(id, "list_installed_skills", map[string]any{"instance_id": instID.String()}).
		assertOK().decode(&afterList)
	id++
	for _, sk := range afterList {
		if sk["skill_name"] == "novel-skill-xyz" && sk["source"] == "installed" {
			t.Errorf("novel-skill-xyz still present with source=installed after uninstall")
		}
	}
	_ = id
}

// ---------------------------------------------------------------------------
// I.6 — install v1.0.0 without force again (error), then force-upgrade to v2.0.0
// ---------------------------------------------------------------------------

func TestMCP_SkillPackForceUpgrade(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "org-force-upgrade", nil)

	packV1 := minimalPackYAML("upgrade-pack", "1.0.0")
	packV2 := minimalPackYAML("upgrade-pack", "2.0.0")
	skillYAML := promptSkillYAML("upgrade-skill")
	skills := skillsJSONArray(map[string]any{
		"name":       "upgrade-skill",
		"skill_yaml": skillYAML,
	})

	// First install — success.
	c.call(id, "install_pack", map[string]any{
		"instance_id": instID.String(),
		"pack_yaml":   packV1,
		"skills":      skills,
	}).assertOK()
	id++

	// Second install without force — error.
	c.call(id, "install_pack", map[string]any{
		"instance_id": instID.String(),
		"pack_yaml":   packV2,
		"skills":      skills,
	}).assertError()
	id++

	// Third install with force — success.
	var upgraded map[string]any
	c.call(id, "install_pack", map[string]any{
		"instance_id": instID.String(),
		"pack_yaml":   packV2,
		"skills":      skills,
		"force":       true,
	}).assertOK().decode(&upgraded)
	id++

	if upgraded["pack_version"] != "2.0.0" {
		t.Errorf("force upgrade: pack_version=%v, want 2.0.0", upgraded["pack_version"])
	}
	_ = id
}

// ---------------------------------------------------------------------------
// I.7 — install with invalid skill.yaml (missing type); expect error + no partial install
// ---------------------------------------------------------------------------

func TestMCP_SkillPackInvalidPayload(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "org-invalid-payload", nil)

	packYAML := minimalPackYAML("bad-pack", "1.0.0")
	// Missing required "type" field.
	badSkillYAML := "name: bad-skill\nversion: \"1.0.0\"\ndescription: \"Missing type\"\n"
	skills := skillsJSONArray(map[string]any{
		"name":       "bad-skill",
		"skill_yaml": badSkillYAML,
	})

	c.call(id, "install_pack", map[string]any{
		"instance_id": instID.String(),
		"pack_yaml":   packYAML,
		"skills":      skills,
	}).assertError()
	id++

	// Verify no partial install.
	var packs []map[string]any
	c.call(id, "list_packs", map[string]any{"instance_id": instID.String()}).
		assertOK().decode(&packs)
	id++
	for _, p := range packs {
		if p["pack_name"] == "bad-pack" {
			t.Errorf("bad-pack should not be installed after invalid payload")
		}
	}
	_ = id
}

// ---------------------------------------------------------------------------
// I.8 — script skill that sleeps 60s; verify timeout error within 31s
// ---------------------------------------------------------------------------

func TestMCP_RunSkillTimeout(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "org-skill-timeout", nil)

	packYAML := minimalPackYAML("timeout-pack", "1.0.0")
	skillYAML := scriptSkillYAML("sleep-skill", "sh")
	// Use exec to replace the shell with sleep so SIGKILL from the context
	// timeout hits the sleep process directly (no orphaned child process).
	scriptSrc := "#!/bin/sh\nexec sleep 35\n"
	skills := skillsJSONArray(map[string]any{
		"name":        "sleep-skill",
		"skill_yaml":  skillYAML,
		"script_src":  scriptSrc,
		"script_lang": "sh",
	})
	c.call(id, "install_pack", map[string]any{
		"instance_id": instID.String(),
		"pack_yaml":   packYAML,
		"skills":      skills,
	}).assertOK()
	id++

	start := time.Now()
	c.call(id, "run_skill", map[string]any{
		"instance_id": instID.String(),
		"skill_name":  "sleep-skill",
	}).assertError()
	elapsed := time.Since(start)

	if elapsed > 31*time.Second {
		t.Errorf("run_skill timeout: took %v, expected < 31s", elapsed)
	}
	t.Logf("run_skill timeout: returned in %v", elapsed)
	_ = id
}

// ---------------------------------------------------------------------------
// I.9 — install an app; verify list_apps returns display metadata
// ---------------------------------------------------------------------------

func TestMCP_AppInstallAndList(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "org-app-install", nil)

	appYAML := `name: my-test-app
version: "1.0.0"
url: "http://localhost:19999"
display:
  name: "My Test App"
  description: "An app for testing"
  icon: "chart"
  category: "analysis"
output:
  format: markdown
`
	if err := packTestAppSvc(t, svc).InstallApp(
		packTestAuditCtx(), instID, "app-pack", "1.0.0", appYAML, "test", false,
	); err != nil {
		t.Fatalf("InstallApp: %v", err)
	}

	var apps []map[string]any
	c.call(id, "list_apps", map[string]any{"instance_id": instID.String()}).
		assertOK().decode(&apps)
	id++

	found := false
	for _, a := range apps {
		if a["app_name"] == "my-test-app" {
			found = true
			disp, ok := a["display"].(map[string]any)
			if !ok {
				t.Errorf("list_apps: display is not an object")
			} else if disp["name"] != "My Test App" {
				t.Errorf("list_apps: display.name=%v, want My Test App", disp["name"])
			}
		}
	}
	if !found {
		t.Errorf("list_apps: my-test-app not found in %v", apps)
	}
	_ = id
}

// ---------------------------------------------------------------------------
// I.10 — run_app; verify X-Strategy-Signature header present and document returned
// ---------------------------------------------------------------------------

func TestMCP_AppRun(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "org-app-run", nil)

	var receivedSig string
	appServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/run" {
			receivedSig = r.Header.Get("X-Strategy-Signature")
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			fmt.Fprint(w, `{"document":{"format":"markdown","content":"# Hello from test app"}}`)
		} else {
			http.NotFound(w, r)
		}
	}))
	defer appServer.Close()

	appYAML := fmt.Sprintf(`name: run-test-app
version: "1.0.0"
url: %q
display:
  name: "Run Test App"
output:
  format: markdown
`, appServer.URL)

	if err := packTestAppSvc(t, svc).InstallApp(
		packTestAuditCtx(), instID, "run-test-pack", "1.0.0", appYAML, "test", false,
	); err != nil {
		t.Fatalf("InstallApp: %v", err)
	}

	var result map[string]any
	c.call(id, "run_app", map[string]any{
		"instance_id": instID.String(),
		"app_name":    "run-test-app",
	}).assertOK().decode(&result)
	id++

	if receivedSig == "" {
		t.Error("run_app: X-Strategy-Signature header not received by app server")
	}
	if !strings.HasPrefix(receivedSig, "sha256=") {
		t.Errorf("run_app: signature format unexpected: %q", receivedSig)
	}
	doc, ok := result["document"].(map[string]any)
	if !ok {
		t.Fatalf("run_app: document not present in result: %v", result)
	}
	if doc["format"] != "markdown" {
		t.Errorf("run_app: document.format=%v, want markdown", doc["format"])
	}
	if !strings.Contains(fmt.Sprintf("%v", doc["content"]), "Hello from test app") {
		t.Errorf("run_app: document.content missing expected text: %v", doc["content"])
	}
	_ = id
}

// ---------------------------------------------------------------------------
// I.11 — app returns staged_mutations; verify batch_id returned + pending batch
// ---------------------------------------------------------------------------

func TestMCP_AppRunStagedMutations(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "org-app-mutations", nil)

	appServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/run" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			fmt.Fprint(w, `{
				"document":{"format":"markdown","content":"staged mutations test"},
				"staged_mutations":[
					{"artifact_key":"test-feature-001","artifact_type":"feature","payload":{"name":"Auto Feature"}}
				]
			}`)
		}
	}))
	defer appServer.Close()

	appYAML := fmt.Sprintf(`name: mutation-app
version: "1.0.0"
url: %q
display:
  name: "Mutation App"
output:
  format: markdown
  can_stage_mutations: true
`, appServer.URL)

	if err := packTestAppSvc(t, svc).InstallApp(
		packTestAuditCtx(), instID, "mutation-pack", "1.0.0", appYAML, "test", false,
	); err != nil {
		t.Fatalf("InstallApp: %v", err)
	}

	var result map[string]any
	c.call(id, "run_app", map[string]any{
		"instance_id": instID.String(),
		"app_name":    "mutation-app",
	}).assertOK().decode(&result)
	id++

	if result["batch_id"] == nil {
		t.Error("run_app with staged_mutations: expected batch_id, got nil")
	}
	batchID := fmt.Sprintf("%v", result["batch_id"])

	var batches []map[string]any
	c.call(id, "list_pending_batches", map[string]any{"instance_id": instID.String()}).
		assertOK().decode(&batches)
	id++

	found := false
	for _, b := range batches {
		if fmt.Sprintf("%v", b["batch_id"]) == batchID {
			found = true
		}
	}
	if !found {
		t.Errorf("run_app: batch %q not found in list_pending_batches", batchID)
	}
	_ = id
}

// ---------------------------------------------------------------------------
// I.12 — payload cap: many large artifacts trigger cap error before HTTP call
// ---------------------------------------------------------------------------

func TestMCP_AppRunPayloadCap(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	// 200 features × ~20 KB each ≈ 4 MB, exceeds the 2 MB cap.
	bigValue := strings.Repeat("x", 20*1024)
	payloads := make(map[string]any, 200)
	for i := 0; i < 200; i++ {
		key := fmt.Sprintf("feature-%04d", i)
		payloads[key] = map[string]any{"name": key, "description": bigValue}
	}
	_, instID := seedInstance(t, svc, "org-payload-cap", payloads)

	appYAML := `name: cap-test-app
version: "1.0.0"
url: "http://localhost:19888"
display:
  name: "Cap Test App"
output:
  format: markdown
requires:
  artifacts: []
`
	if err := packTestAppSvc(t, svc).InstallApp(
		packTestAuditCtx(), instID, "cap-pack", "1.0.0", appYAML, "test", false,
	); err != nil {
		t.Fatalf("InstallApp: %v", err)
	}

	c.call(id, "run_app", map[string]any{
		"instance_id": instID.String(),
		"app_name":    "cap-test-app",
	}).assertError().contains("bytes")
	_ = id
}

// ---------------------------------------------------------------------------
// I.13 — slow app server; verify timeout within 31s
// ---------------------------------------------------------------------------

func TestMCP_AppRunTimeout(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "org-app-timeout", nil)

	slowServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Sleep slightly longer than the app call timeout (30s) so run_app definitely times out.
		// 35s gives the app time to time out and close the connection before this handler returns.
		time.Sleep(35 * time.Second)
	}))
	defer slowServer.Close()

	appYAML := fmt.Sprintf(`name: slow-app
version: "1.0.0"
url: %q
display:
  name: "Slow App"
output:
  format: markdown
`, slowServer.URL)

	if err := packTestAppSvc(t, svc).InstallApp(
		packTestAuditCtx(), instID, "slow-pack", "1.0.0", appYAML, "test", false,
	); err != nil {
		t.Fatalf("InstallApp: %v", err)
	}

	start := time.Now()
	c.call(id, "run_app", map[string]any{
		"instance_id": instID.String(),
		"app_name":    "slow-app",
	}).assertError()
	elapsed := time.Since(start)

	if elapsed > 31*time.Second {
		t.Errorf("run_app timeout: took %v, expected < 31s", elapsed)
	}
	t.Logf("run_app timeout: returned in %v", elapsed)
	_ = id
}

// ---------------------------------------------------------------------------
// I.14 — 3 consecutive failures → app status becomes degraded
// ---------------------------------------------------------------------------

func TestMCP_AppDegradedAfterThreeFailures(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "org-app-degrade", nil)

	failServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "internal server error", http.StatusInternalServerError)
	}))
	defer failServer.Close()

	appYAML := fmt.Sprintf(`name: fail-app
version: "1.0.0"
url: %q
display:
  name: "Fail App"
output:
  format: markdown
`, failServer.URL)

	if err := packTestAppSvc(t, svc).InstallApp(
		packTestAuditCtx(), instID, "fail-pack", "1.0.0", appYAML, "test", false,
	); err != nil {
		t.Fatalf("InstallApp: %v", err)
	}

	// 3 consecutive failures.
	for i := 0; i < 3; i++ {
		c.call(id, "run_app", map[string]any{
			"instance_id": instID.String(),
			"app_name":    "fail-app",
		}).assertError()
		id++
	}

	// App status should be degraded.
	var apps []map[string]any
	c.call(id, "list_apps", map[string]any{"instance_id": instID.String()}).
		assertOK().decode(&apps)
	id++

	for _, a := range apps {
		if a["app_name"] == "fail-app" {
			if a["status"] != "degraded" {
				t.Errorf("fail-app status=%v after 3 failures, want degraded", a["status"])
			}
		}
	}

	// A 4th run_app on a degraded app should fail immediately.
	c.call(id, "run_app", map[string]any{
		"instance_id": instID.String(),
		"app_name":    "fail-app",
	}).assertError()
	id++
	_ = id
}

// ---------------------------------------------------------------------------
// I.15 — standard pack auto-installed on new instance
// ---------------------------------------------------------------------------

func TestMCP_StandardPackAutoInstalled(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "org-standard-pack", nil)

	var packs []map[string]any
	c.call(id, "list_packs", map[string]any{"instance_id": instID.String()}).
		assertOK().decode(&packs)
	id++

	found := false
	for _, p := range packs {
		if p["pack_name"] == "emergent-standard" {
			found = true
			if p["up_to_date"] != true {
				t.Errorf("emergent-standard: up_to_date=%v, want true", p["up_to_date"])
			}
		}
	}
	if !found {
		t.Errorf("emergent-standard pack not found in list_packs: %v", packs)
	}
	_ = id
}

// ---------------------------------------------------------------------------
// I.16 — health_check reports up_to_date=false when standard pack is at old version
// ---------------------------------------------------------------------------

func TestMCP_HealthCheckSkewReporting(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "org-skew-report", nil)

	// Re-install emergent-standard at a fake old version via force.
	fakePackYAML := "name: emergent-standard\nversion: \"0.0.1\"\ndescription: \"fake old\"\ntrusted: true\n"
	skillYAML := promptSkillYAML("dummy-skew-skill")
	skills := skillsJSONArray(map[string]any{
		"name":       "dummy-skew-skill",
		"skill_yaml": skillYAML,
	})
	c.call(id, "install_pack", map[string]any{
		"instance_id": instID.String(),
		"pack_yaml":   fakePackYAML,
		"skills":      skills,
		"force":       true,
	}).assertOK()
	id++

	var health map[string]any
	c.call(id, "health_check", map[string]any{"instance_id": instID.String()}).
		assertOK().decode(&health)
	id++

	sps, ok := health["standard_pack_status"].(map[string]any)
	if !ok {
		t.Fatalf("health_check: standard_pack_status not an object: %v", health["standard_pack_status"])
	}
	if sps["up_to_date"] != false {
		t.Errorf("health_check: up_to_date=%v after fake old install, want false", sps["up_to_date"])
	}
	if fmt.Sprintf("%v", sps["installed_version"]) == fmt.Sprintf("%v", sps["server_version"]) {
		t.Errorf("health_check: installed_version and server_version should differ; both=%v", sps["server_version"])
	}
	t.Logf("standard_pack_status: %v", sps)
	_ = id
}

// ---------------------------------------------------------------------------
// I.17 — describe_pack_format returns all three schemas
// ---------------------------------------------------------------------------

func TestMCP_DescribePackFormat(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)

	var result map[string]any
	c.call(1, "describe_pack_format", nil).assertOK().decode(&result)

	for _, key := range []string{"pack_yaml_schema", "skill_yaml_schema", "app_yaml_schema", "example_pack"} {
		if result[key] == nil {
			t.Errorf("describe_pack_format: missing key %q", key)
		}
	}
	ex, ok := result["example_pack"].(map[string]any)
	if !ok {
		t.Fatal("describe_pack_format: example_pack is not an object")
	}
	if ex["pack_yaml"] == nil {
		t.Error("describe_pack_format: example_pack missing pack_yaml")
	}
	// Validate execution_modes present.
	if result["execution_modes"] == nil {
		t.Error("describe_pack_format: missing execution_modes")
	}
}

// ---------------------------------------------------------------------------
// I.18 — app with min_contract_version > server version rejected at install
// ---------------------------------------------------------------------------

func TestMCP_AppIncompatibleContractVersion(t *testing.T) {
	svc := buildSvc(t)

	_, instID := seedInstance(t, svc, "org-contract-version", nil)

	appYAML := `name: future-app
version: "1.0.0"
url: "http://localhost:19777"
min_contract_version: 99
display:
  name: "Future App"
output:
  format: markdown
`
	err := packTestAppSvc(t, svc).InstallApp(
		packTestAuditCtx(), instID, "future-pack", "1.0.0", appYAML, "test", false,
	)
	if err == nil {
		t.Error("InstallApp with min_contract_version:99 should have returned an error")
	} else {
		t.Logf("correctly rejected: %v", err)
	}
}

// ---------------------------------------------------------------------------
// I.19 — scaffold_skill prompt-mode; verify skill_yaml + pack_yaml are valid
// ---------------------------------------------------------------------------

func TestMCP_ScaffoldSkill_PromptMode(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	var result map[string]any
	c.call(id, "scaffold_skill", map[string]any{
		"name":        "my-test-skill",
		"type":        "creation",
		"execution":   "prompt",
		"description": "A scaffolded test skill",
	}).assertOK().decode(&result)
	id++

	skillYAML := fmt.Sprintf("%v", result["skill_yaml"])
	packYAML := fmt.Sprintf("%v", result["pack_yaml"])
	promptMD := fmt.Sprintf("%v", result["prompt_md"])

	if !strings.Contains(skillYAML, "name: my-test-skill") {
		t.Errorf("scaffold_skill: skill_yaml missing name; got %q", skillYAML)
	}
	if !strings.Contains(skillYAML, "type: creation") {
		t.Errorf("scaffold_skill: skill_yaml missing type; got %q", skillYAML)
	}
	if !strings.Contains(skillYAML, "execution: prompt") {
		t.Errorf("scaffold_skill: skill_yaml missing execution; got %q", skillYAML)
	}
	if !strings.Contains(packYAML, "name: my-test-skill") {
		t.Errorf("scaffold_skill: pack_yaml missing name; got %q", packYAML)
	}

	// Verify ParsePackBundle accepts the scaffolded content by installing it.
	_, instID := seedInstance(t, svc, "org-scaffold-validate", nil)
	skills := skillsJSONArray(map[string]any{
		"name":       "my-test-skill",
		"skill_yaml": skillYAML,
		"prompt_md":  promptMD,
	})
	c.call(id, "install_pack", map[string]any{
		"instance_id": instID.String(),
		"pack_yaml":   packYAML,
		"skills":      skills,
	}).assertOK()
	_ = id
}

// ---------------------------------------------------------------------------
// I.20 — scaffold_skill script-mode; verify script fields + stdin/stdout notes
// ---------------------------------------------------------------------------

func TestMCP_ScaffoldSkill_ScriptMode(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)

	var result map[string]any
	c.call(1, "scaffold_skill", map[string]any{
		"name":        "script-test-skill",
		"type":        "analysis",
		"execution":   "script",
		"script_lang": "sh",
		"description": "A scaffolded script skill",
	}).assertOK().decode(&result)

	skillYAML := fmt.Sprintf("%v", result["skill_yaml"])
	promptMD := fmt.Sprintf("%v", result["prompt_md"])

	if !strings.Contains(skillYAML, "execution: script") {
		t.Errorf("scaffold_skill script: missing execution: script; got %q", skillYAML)
	}
	if !strings.Contains(skillYAML, "script_lang: sh") {
		t.Errorf("scaffold_skill script: missing script_lang: sh; got %q", skillYAML)
	}
	if !strings.Contains(promptMD, "stdin") {
		t.Errorf("scaffold_skill script: prompt_md missing stdin contract notes; got %q", promptMD)
	}
	if !strings.Contains(promptMD, "stdout") {
		t.Errorf("scaffold_skill script: prompt_md missing stdout contract notes; got %q", promptMD)
	}
}

// ---------------------------------------------------------------------------
// I.21 — skill-importer core skill resolves as prompt-mode
// ---------------------------------------------------------------------------

func TestMCP_SkillImporter_CoreSkillExists(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)

	_, instID := seedInstance(t, svc, "org-skill-importer", nil)

	var result map[string]any
	c.call(1, "run_skill", map[string]any{
		"instance_id": instID.String(),
		"skill_name":  "skill-importer",
	}).assertOK().decode(&result)

	if result["mode"] != "prompt" {
		t.Errorf("skill-importer: mode=%v, want prompt", result["mode"])
	}
	promptMD := fmt.Sprintf("%v", result["prompt_md"])
	if len(promptMD) < 20 {
		t.Errorf("skill-importer: prompt_md too short (%d chars)", len(promptMD))
	}
}

// ---------------------------------------------------------------------------
// I.22 — scaffold_skill → install_pack → get_installed_skill round-trip
// ---------------------------------------------------------------------------

func TestMCP_ScaffoldThenInstall(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "org-scaffold-install", nil)

	// Step 1: scaffold.
	var scaffolded map[string]any
	c.call(id, "scaffold_skill", map[string]any{
		"name":        "round-trip-skill",
		"type":        "review",
		"execution":   "prompt",
		"description": "Round-trip scaffold test",
	}).assertOK().decode(&scaffolded)
	id++

	skillYAML := fmt.Sprintf("%v", scaffolded["skill_yaml"])
	packYAML := fmt.Sprintf("%v", scaffolded["pack_yaml"])
	promptMD := fmt.Sprintf("%v", scaffolded["prompt_md"])

	// Step 2: install_pack with scaffolded content.
	skills := skillsJSONArray(map[string]any{
		"name":       "round-trip-skill",
		"skill_yaml": skillYAML,
		"prompt_md":  promptMD,
	})
	c.call(id, "install_pack", map[string]any{
		"instance_id": instID.String(),
		"pack_yaml":   packYAML,
		"skills":      skills,
	}).assertOK()
	id++

	// Step 3: get_installed_skill should return source: installed.
	var resolved map[string]any
	c.call(id, "get_installed_skill", map[string]any{
		"instance_id": instID.String(),
		"skill_name":  "round-trip-skill",
	}).assertOK().decode(&resolved)
	id++

	if resolved["source"] != "installed" {
		t.Errorf("round-trip: source=%v, want installed", resolved["source"])
	}
	if resolved["skill_name"] != "round-trip-skill" {
		t.Errorf("round-trip: skill_name=%v", resolved["skill_name"])
	}
	_ = id
}

// ---------------------------------------------------------------------------
// Regression: uninstall_pack must also remove strategy_apps rows
// ---------------------------------------------------------------------------

func TestMCP_UninstallPackRemovesApps(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "org-uninstall-apps", nil)

	// Install a pack with a skill.
	packYAML := minimalPackYAML("mixed-pack", "1.0.0")
	skillYAML := promptSkillYAML("mixed-skill")
	skills := skillsJSONArray(map[string]any{
		"name":       "mixed-skill",
		"skill_yaml": skillYAML,
	})
	c.call(id, "install_pack", map[string]any{
		"instance_id": instID.String(),
		"pack_yaml":   packYAML,
		"skills":      skills,
	}).assertOK()
	id++

	// Also install an app for the same pack directly (simulating a mixed pack).
	appYAML := `name: mixed-app
version: "1.0.0"
url: "http://localhost:19111"
display:
  name: "Mixed App"
output:
  format: markdown
`
	if err := packTestAppSvc(t, svc).InstallApp(
		packTestAuditCtx(), instID, "mixed-pack", "1.0.0", appYAML, "test", false,
	); err != nil {
		t.Fatalf("InstallApp: %v", err)
	}

	// Verify app exists before uninstall.
	var appsBefore []map[string]any
	c.call(id, "list_apps", map[string]any{"instance_id": instID.String()}).
		assertOK().decode(&appsBefore)
	id++
	foundBefore := false
	for _, a := range appsBefore {
		if a["app_name"] == "mixed-app" {
			foundBefore = true
		}
	}
	if !foundBefore {
		t.Fatal("mixed-app not found before uninstall")
	}

	// Uninstall the pack.
	var uninstResult map[string]any
	c.call(id, "uninstall_pack", map[string]any{
		"instance_id": instID.String(),
		"pack_name":   "mixed-pack",
	}).assertOK().decode(&uninstResult)
	id++

	// apps_removed must be 1.
	if fmt.Sprintf("%v", uninstResult["apps_removed"]) != "1" {
		t.Errorf("uninstall_pack: apps_removed=%v, want 1", uninstResult["apps_removed"])
	}

	// Verify app is gone.
	var appsAfter []map[string]any
	c.call(id, "list_apps", map[string]any{"instance_id": instID.String()}).
		assertOK().decode(&appsAfter)
	id++
	for _, a := range appsAfter {
		if a["app_name"] == "mixed-app" {
			t.Errorf("mixed-app still present after uninstall_pack")
		}
	}
	_ = id
}

// ---------------------------------------------------------------------------
// Regression: source_filter=canonical must NOT return installed skills
// ---------------------------------------------------------------------------

func TestMCP_SourceFilterCanonicalExcludesInstalled(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "org-canonical-filter", nil)

	// Install a novel skill (not a canonical name).
	packYAML := minimalPackYAML("filter-test-pack", "1.0.0")
	skillYAML := promptSkillYAML("novel-installed-skill-abc")
	skills := skillsJSONArray(map[string]any{
		"name":       "novel-installed-skill-abc",
		"skill_yaml": skillYAML,
	})
	c.call(id, "install_pack", map[string]any{
		"instance_id": instID.String(),
		"pack_yaml":   packYAML,
		"skills":      skills,
	}).assertOK()
	id++

	// source_filter=canonical should NOT include novel-installed-skill-abc.
	var canonicalList []map[string]any
	c.call(id, "list_installed_skills", map[string]any{
		"instance_id":   instID.String(),
		"source_filter": "canonical",
	}).assertOK().decode(&canonicalList)
	id++

	for _, sk := range canonicalList {
		if sk["skill_name"] == "novel-installed-skill-abc" {
			t.Errorf("source_filter=canonical: found installed skill 'novel-installed-skill-abc' — should be excluded")
		}
		if sk["source"] != "canonical" && sk["source"] != "generator-alias" {
			t.Errorf("source_filter=canonical: got skill with source=%v", sk["source"])
		}
	}

	// source_filter=installed should include it.
	var installedList []map[string]any
	c.call(id, "list_installed_skills", map[string]any{
		"instance_id":   instID.String(),
		"source_filter": "installed",
	}).assertOK().decode(&installedList)
	id++

	found := false
	for _, sk := range installedList {
		if sk["skill_name"] == "novel-installed-skill-abc" && sk["source"] == "installed" {
			found = true
		}
	}
	if !found {
		t.Errorf("source_filter=installed: novel-installed-skill-abc not found")
	}
	_ = id
}

// ---------------------------------------------------------------------------
// Regression: get_pack must include apps for mixed packs
// ---------------------------------------------------------------------------

func TestMCP_GetPackIncludesApps(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "org-get-pack-apps", nil)

	// Install a skill pack.
	packYAML := minimalPackYAML("full-pack", "1.0.0")
	skillYAML := promptSkillYAML("full-pack-skill")
	skills := skillsJSONArray(map[string]any{
		"name":       "full-pack-skill",
		"skill_yaml": skillYAML,
	})
	c.call(id, "install_pack", map[string]any{
		"instance_id": instID.String(),
		"pack_yaml":   packYAML,
		"skills":      skills,
	}).assertOK()
	id++

	// Install an app under the same pack.
	appYAML := `name: full-pack-app
version: "1.0.0"
url: "http://localhost:19222"
display:
  name: "Full Pack App"
output:
  format: markdown
`
	if err := packTestAppSvc(t, svc).InstallApp(
		packTestAuditCtx(), instID, "full-pack", "1.0.0", appYAML, "test", false,
	); err != nil {
		t.Fatalf("InstallApp: %v", err)
	}

	var result map[string]any
	c.call(id, "get_pack", map[string]any{
		"instance_id": instID.String(),
		"pack_name":   "full-pack",
	}).assertOK().decode(&result)
	id++

	if fmt.Sprintf("%v", result["skill_count"]) != "1" {
		t.Errorf("get_pack: skill_count=%v, want 1", result["skill_count"])
	}
	if fmt.Sprintf("%v", result["app_count"]) != "1" {
		t.Errorf("get_pack: app_count=%v, want 1", result["app_count"])
	}
	apps, ok := result["apps"].([]interface{})
	if !ok || len(apps) == 0 {
		t.Errorf("get_pack: apps missing or empty: %v", result["apps"])
	}
	_ = id
}

// ---------------------------------------------------------------------------
// Regression: HMAC signature must be cryptographically correct, not just present
// ---------------------------------------------------------------------------

func TestMCP_AppRunHMACIsCorrect(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1

	_, instID := seedInstance(t, svc, "org-hmac-correct", nil)

	// Capture the raw request body and the signature from the app server.
	var capturedBody []byte
	var capturedSig string

	appServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/run" {
			capturedSig = r.Header.Get("X-Strategy-Signature")
			body, _ := io.ReadAll(r.Body)
			capturedBody = body
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			fmt.Fprint(w, `{"document":{"format":"markdown","content":"hmac test"}}`)
		}
	}))
	defer appServer.Close()

	appYAML := fmt.Sprintf(`name: hmac-test-app
version: "1.0.0"
url: %q
display:
  name: "HMAC Test App"
output:
  format: markdown
`, appServer.URL)

	// Install app and retrieve its signing secret from the DB directly.
	appSvc := packTestAppSvc(t, svc)
	if err := appSvc.InstallApp(
		packTestAuditCtx(), instID, "hmac-pack", "1.0.0", appYAML, "test", false,
	); err != nil {
		t.Fatalf("InstallApp: %v", err)
	}

	// Run the app via MCP.
	c.call(id, "run_app", map[string]any{
		"instance_id": instID.String(),
		"app_name":    "hmac-test-app",
	}).assertOK()
	id++

	if capturedSig == "" || capturedBody == nil {
		t.Fatal("app server did not receive the request")
	}

	// Extract the hex value after "sha256=".
	if !strings.HasPrefix(capturedSig, "sha256=") {
		t.Fatalf("signature format wrong: %q", capturedSig)
	}
	sigHex := strings.TrimPrefix(capturedSig, "sha256=")

	// Retrieve the signing secret from the DB to verify independently.
	type appRow struct {
		SigningSecret string `bun:"signing_secret"`
	}
	var row appRow
	if err := svc.Strategy.DB().NewSelect().
		TableExpr("strategy_apps").
		ColumnExpr("signing_secret").
		Where("instance_id = ? AND app_name = ?", instID, "hmac-test-app").
		Scan(packTestAuditCtx(), &row); err != nil {
		t.Fatalf("load signing secret: %v", err)
	}

	mac := hmac.New(sha256.New, []byte(row.SigningSecret))
	mac.Write(capturedBody) //nolint:errcheck
	expectedSig := hex.EncodeToString(mac.Sum(nil))

	if sigHex != expectedSig {
		t.Errorf("HMAC mismatch: got %q, want %q", sigHex, expectedSig)
	}
	t.Logf("HMAC verified correct for %d-byte payload", len(capturedBody))
	_ = id
}
