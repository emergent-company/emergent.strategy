package mcpserver_test

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	syncdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/sync"
)

type githubSyncBlock struct {
	State               string   `json:"state"`
	Reason              string   `json:"reason"`
	CheckedAt           string   `json:"checked_at"`
	SyncToolsRegistered bool     `json:"sync_tools_registered"`
	ImportRoutes        []string `json:"import_routes"`
}

func healthSync(t *testing.T, c *mcpClient, id int, instID string) githubSyncBlock {
	t.Helper()
	var h struct {
		GithubSync githubSyncBlock `json:"github_sync"`
	}
	c.call(id, "health_check", map[string]any{"instance_id": instID}).assertOK().decode(&h)
	return h.GithubSync
}

type instanceSync struct {
	Name      string `json:"name"`
	Available bool   `json:"github_sync_available"`
	State     string `json:"github_sync_state"`
	Reason    string `json:"github_sync_reason"`
}

func getInstanceSync(t *testing.T, c *mcpClient, id int, instID string) instanceSync {
	t.Helper()
	var got instanceSync
	c.call(id, "get_instance", map[string]any{"instance_id": instID}).assertOK().decode(&got)
	return got
}

func toolDescription(t *testing.T, c *mcpClient, name string) string {
	t.Helper()
	body := `{"jsonrpc":"2.0","id":98,"method":"tools/list","params":{}}`
	req, _ := http.NewRequest(http.MethodPost, c.server.URL+"/mcp", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Mcp-Session-Id", c.sessionID)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("tools/list: %v", err)
	}
	defer resp.Body.Close() //nolint:errcheck
	raw, _ := io.ReadAll(resp.Body)
	var env struct {
		Result struct {
			Tools []struct {
				Name        string `json:"name"`
				Description string `json:"description"`
			} `json:"tools"`
		} `json:"result"`
	}
	if err := json.Unmarshal(jsonRPCPayload(raw), &env); err != nil {
		t.Fatalf("parse tools/list: %v", err)
	}
	for _, tool := range env.Result.Tools {
		if tool.Name == name {
			return tool.Description
		}
	}
	t.Fatalf("tool %q is not listed", name)
	return ""
}

// An operator who has not configured the GitHub App sees sync tools missing and
// has no way to learn why. health_check says so, with the reason.
func TestMCP_HealthCheck_SaysGithubSyncIsDisabledAndWhy(t *testing.T) {
	svc := buildSvc(t)
	svc.GithubSync = syncdom.Availability{State: syncdom.AvailabilityDisabled, Reason: "GITHUB_APP_ID not configured"}
	_, instID := seedInstance(t, svc, "sync-off", nil)
	c := newMCPClient(t, svc)

	got := healthSync(t, c, 1, instID.String())

	if got.State != "disabled" || got.Reason != "GITHUB_APP_ID not configured" {
		t.Errorf("github_sync = %+v, want disabled with the recorded reason", got)
	}
	if got.SyncToolsRegistered {
		t.Error("sync_tools_registered = true, want false: no Sync service is wired")
	}
	joined := strings.Join(got.ImportRoutes, " | ")
	if !strings.Contains(joined, "import") || strings.Contains(joined, "import_from_github: available") {
		t.Errorf("import routes = %q, want the CLI import and no available MCP import", joined)
	}
}

// Nothing recorded and no Sync service is still disabled, with a reason: a
// server wired without the record must not read as healthy.
func TestMCP_HealthCheck_UnrecordedStateWithoutSyncReadsAsDisabled(t *testing.T) {
	svc := buildSvc(t)
	_, instID := seedInstance(t, svc, "sync-unrecorded", nil)
	c := newMCPClient(t, svc)

	got := healthSync(t, c, 1, instID.String())

	if got.State != "disabled" || got.Reason == "" {
		t.Errorf("github_sync = %+v, want disabled with a reason", got)
	}
}

func TestMCP_HealthCheck_SaysGithubSyncIsEnabled(t *testing.T) {
	svc := buildSvcWithSync(t, &mockRepoWriter{})
	_, instID := seedInstance(t, svc, "sync-on", nil)
	c := newMCPClient(t, svc)

	got := healthSync(t, c, 1, instID.String())

	if got.State != "enabled" || got.Reason != "" || !got.SyncToolsRegistered {
		t.Errorf("github_sync = %+v, want enabled, no reason, tools registered", got)
	}
	if !strings.Contains(strings.Join(got.ImportRoutes, " | "), "import_from_github") {
		t.Errorf("import routes = %v, want the MCP import listed", got.ImportRoutes)
	}
}

func TestMCP_HealthCheck_SaysGithubSyncIsDegradedAndWhy(t *testing.T) {
	svc := buildSvcWithSync(t, &mockRepoWriter{})
	svc.GithubSync = syncdom.Availability{State: syncdom.AvailabilityDegraded, Reason: "the App lacks contents:write"}
	_, instID := seedInstance(t, svc, "sync-degraded", nil)
	c := newMCPClient(t, svc)

	got := healthSync(t, c, 1, instID.String())

	if got.State != "degraded" || got.Reason != "the App lacks contents:write" || !got.SyncToolsRegistered {
		t.Errorf("github_sync = %+v, want degraded with the reason, tools still registered", got)
	}
}

func TestMCP_GetInstance_SaysWhetherGithubSyncIsAvailable(t *testing.T) {
	t.Run("disabled", func(t *testing.T) {
		svc := buildSvc(t)
		svc.GithubSync = syncdom.Availability{State: syncdom.AvailabilityDisabled, Reason: "GITHUB_APP_ID not configured"}
		_, instID := seedInstance(t, svc, "gi-off", nil)
		c := newMCPClient(t, svc)

		got := getInstanceSync(t, c, 1, instID.String())

		if got.Available || got.State != "disabled" || got.Reason != "GITHUB_APP_ID not configured" {
			t.Errorf("got %+v, want unavailable, disabled, with the reason", got)
		}
		if got.Name == "" {
			t.Error("the instance fields are gone from get_instance")
		}
	})
	t.Run("enabled", func(t *testing.T) {
		svc := buildSvcWithSync(t, &mockRepoWriter{})
		_, instID := seedInstance(t, svc, "gi-on", nil)
		c := newMCPClient(t, svc)

		got := getInstanceSync(t, c, 1, instID.String())

		if !got.Available || got.State != "enabled" || got.Reason != "" {
			t.Errorf("got %+v, want available, enabled, no reason", got)
		}
	})
	t.Run("degraded", func(t *testing.T) {
		svc := buildSvcWithSync(t, &mockRepoWriter{})
		svc.GithubSync = syncdom.Availability{State: syncdom.AvailabilityDegraded, Reason: "the App lacks contents:write"}
		_, instID := seedInstance(t, svc, "gi-degraded", nil)
		c := newMCPClient(t, svc)

		got := getInstanceSync(t, c, 1, instID.String())

		if !got.Available || got.State != "degraded" || got.Reason == "" {
			t.Errorf("got %+v, want available (the tools exist), degraded, with the reason", got)
		}
	})
}

// A client that looks for a sync tool and finds none gets "Unknown tool". The
// stub answers instead: what is wrong, which tools are affected, and what to use
// in the meantime.
func TestMCP_GetSyncInfo_ExplainsWhySyncToolsAreMissing(t *testing.T) {
	svc := buildSvc(t)
	svc.GithubSync = syncdom.Availability{State: syncdom.AvailabilityDisabled, Reason: "GITHUB_APP_ID not configured"}
	c := newMCPClient(t, svc)
	c.activateAllTools()

	var got struct {
		githubSyncBlock
		UnavailableTools []string `json:"unavailable_tools"`
		Alternatives     []string `json:"alternatives"`
	}
	c.call(1, "get_sync_info", map[string]any{}).assertOK().decode(&got)

	if got.State != "disabled" || got.Reason != "GITHUB_APP_ID not configured" {
		t.Errorf("state = %q, reason = %q, want disabled with the recorded reason", got.State, got.Reason)
	}
	for _, tool := range []string{"sync_to_github", "import_from_github", "get_sync_state"} {
		found := false
		for _, u := range got.UnavailableTools {
			found = found || u == tool
		}
		if !found {
			t.Errorf("unavailable_tools = %v, want %s listed", got.UnavailableTools, tool)
		}
	}
	alt := strings.Join(got.Alternatives, " | ")
	if !strings.Contains(alt, "strategy-server import") || !strings.Contains(alt, "export_instance_yaml") {
		t.Errorf("alternatives = %q, want the CLI import and export_instance_yaml", alt)
	}
}

func TestMCP_GetSyncInfo_WhenSyncWorksListsNothingUnavailable(t *testing.T) {
	svc := buildSvcWithSync(t, &mockRepoWriter{})
	c := newMCPClient(t, svc)
	c.activateAllTools()

	var got struct {
		githubSyncBlock
		UnavailableTools []string `json:"unavailable_tools"`
	}
	c.call(1, "get_sync_info", map[string]any{}).assertOK().decode(&got)

	if got.State != "enabled" || len(got.UnavailableTools) != 0 || !got.SyncToolsRegistered {
		t.Errorf("got %+v, want enabled with nothing unavailable", got)
	}
}

func TestMCP_ImportInstanceDescription_NamesTheImportRoutes(t *testing.T) {
	c := newMCPClient(t, buildSvc(t))
	c.activateAllTools()

	desc := toolDescription(t, c, "import_instance")

	for _, want := range []string{"import_from_github", "GitHub App", "strategy-server import", "get_sync_info"} {
		if !strings.Contains(desc, want) {
			t.Errorf("import_instance description lacks %q:\n%s", want, desc)
		}
	}
}
