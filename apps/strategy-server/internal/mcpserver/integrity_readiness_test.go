package mcpserver_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"
)

// callStructured calls a tool and returns its structuredContent (the verdict)
// and its text content (the detail).
func (c *mcpClient) callStructured(id int, tool string, args map[string]any) (json.RawMessage, string) {
	c.t.Helper()
	argsJSON, _ := json.Marshal(args)
	body := fmt.Sprintf(`{"jsonrpc":"2.0","id":%d,"method":"tools/call","params":{"name":%q,"arguments":%s}}`, id, tool, argsJSON)
	req, _ := http.NewRequest(http.MethodPost, c.server.URL+"/mcp", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Mcp-Session-Id", c.sessionID)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		c.t.Fatalf("tool %s: %v", tool, err)
	}
	defer resp.Body.Close() //nolint:errcheck
	raw, _ := io.ReadAll(resp.Body)
	var env struct {
		Result struct {
			StructuredContent json.RawMessage `json:"structuredContent"`
			Content           []struct {
				Text string `json:"text"`
			} `json:"content"`
			IsError bool `json:"isError"`
		} `json:"result"`
	}
	if err := json.Unmarshal(jsonRPCPayload(raw), &env); err != nil {
		c.t.Fatalf("tool %s: parse: %v\n%s", tool, err, raw)
	}
	if env.Result.IsError {
		c.t.Fatalf("tool %s returned an error: %v", tool, env.Result.Content)
	}
	text := ""
	if len(env.Result.Content) > 0 {
		text = env.Result.Content[0].Text
	}
	return env.Result.StructuredContent, text
}

type verdictView struct {
	OK      bool   `json:"ok"`
	Summary string `json:"summary"`
	Counts  struct {
		Error   int `json:"error"`
		Warning int `json:"warning"`
		Info    int `json:"info"`
		Checked int `json:"checked"`
	} `json:"counts"`
	Findings []struct {
		Severity string `json:"severity"`
		Key      string `json:"key"`
		Rule     string `json:"rule"`
		Message  string `json:"message"`
	} `json:"findings"`
}

func TestMCP_ContentReadiness_ReportsFrameworkContentAndDropsTheEmptyScore(t *testing.T) {
	svc := buildSvc(t)
	_, instID := seedInstance(t, svc, "readiness-owner", frameworkMixPayloads(t))
	c := newMCPClient(t, svc)
	c.activateAllTools()

	structured, detail := c.callStructured(1, "check_content_readiness", map[string]any{"instance_id": instID.String()})
	var v verdictView
	if err := json.Unmarshal(structured, &v); err != nil {
		t.Fatalf("verdict: %v\n%s", err, structured)
	}

	if !v.OK || v.Counts.Error != 0 {
		t.Errorf("integrity findings are advisory; ok=%v errors=%d", v.OK, v.Counts.Error)
	}
	rules := map[string]string{}
	for _, f := range v.Findings {
		if strings.HasPrefix(f.Rule, "integrity.") {
			rules[f.Rule+"|"+f.Key] = f.Severity
		}
	}
	if rules["integrity.unmodified_template|north_star"] != "warning" {
		t.Errorf("an unmodified template must be a warning on its key; got %v", rules)
	}
	if rules["integrity.canonical_reference|"] != "info" {
		t.Errorf("canonical definitions must be one aggregated info finding; got %v", rules)
	}
	if strings.Contains(v.Summary, "0/100") {
		t.Errorf("summary %q reports a score for zero features", v.Summary)
	}
	if !strings.Contains(strings.ToLower(v.Summary), "no features") {
		t.Errorf("summary %q should say there are no features", v.Summary)
	}
	if v.Counts.Checked < 4 {
		t.Errorf("checked = %d; every artifact in the instance was examined", v.Counts.Checked)
	}

	var d map[string]any
	if err := json.Unmarshal([]byte(detail), &d); err != nil {
		t.Fatalf("detail: %v", err)
	}
	if _, has := d["average_score"]; has {
		t.Error("the detail must not carry an average score when there are no features")
	}
	if d["content_integrity"] == nil {
		t.Error("the detail must carry the content_integrity report")
	}
}

func TestMCP_HealthCheck_HasAContentIntegrityBlock(t *testing.T) {
	svc := buildSvc(t)
	_, instID := seedInstance(t, svc, "health-owner", frameworkMixPayloads(t))
	c := newMCPClient(t, svc)

	var h struct {
		ArtifactCount    int `json:"artifact_count"`
		ContentIntegrity struct {
			Counts  map[string]int `json:"counts"`
			Scanned int            `json:"scanned"`
			Source  string         `json:"source"`
		} `json:"content_integrity"`
	}
	c.call(1, "health_check", map[string]any{"instance_id": instID.String()}).assertOK().decode(&h)

	if h.ContentIntegrity.Counts["canonical_reference"] != 1 || h.ContentIntegrity.Counts["unmodified_template"] != 1 {
		t.Errorf("content_integrity = %+v", h.ContentIntegrity)
	}
	if h.ArtifactCount != 4 || h.ContentIntegrity.Scanned != 4 {
		t.Errorf("artifact_count=%d scanned=%d, want 4 and 4", h.ArtifactCount, h.ContentIntegrity.Scanned)
	}
	if h.ContentIntegrity.Source == "" {
		t.Error("the block must say what it matched against")
	}
}
