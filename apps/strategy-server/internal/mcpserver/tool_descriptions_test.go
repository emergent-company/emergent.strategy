package mcpserver_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

// toolDescriptions returns name -> description from tools/list with every
// category active.
func (c *mcpClient) toolDescriptions() map[string]string {
	c.t.Helper()
	c.activateAllTools()
	req, _ := http.NewRequest(http.MethodPost, c.server.URL+"/mcp",
		bytes.NewBufferString(`{"jsonrpc":"2.0","id":98,"method":"tools/list","params":{}}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Mcp-Session-Id", c.sessionID)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		c.t.Fatalf("tools/list: %v", err)
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
		c.t.Fatalf("parse tools/list: %v", err)
	}
	out := map[string]string{}
	for _, tl := range env.Result.Tools {
		out[tl.Name] = tl.Description
	}
	return out
}

// A client picks tools by their descriptions. The tools that serve framework
// content must say so, and the tools that serve the company's strategy must say
// they are authoritative, or a model treats a template as the company's answer.
func TestToolDescriptions_NameTheirAuthority(t *testing.T) {
	d := newMCPClient(t, buildSvc(t)).toolDescriptions()

	framework := map[string][]string{
		"get_definition":   {"framework", "not"},
		"list_definitions": {"framework", "not"},
		"get_template":     {"framework", "not"},
		"list_templates":   {"framework", "not"},
	}
	for tool, words := range framework {
		desc := strings.ToLower(d[tool])
		for _, w := range words {
			if !strings.Contains(desc, w) {
				t.Errorf("%s: description does not say it serves %q content: %q", tool, w, d[tool])
			}
		}
		if !strings.Contains(desc, "get_outline") && !strings.Contains(desc, "get_section") {
			t.Errorf("%s: description does not point to the reads for the company's own strategy", tool)
		}
	}

	if !strings.Contains(strings.ToLower(d["search_strategy"]), "discovery") {
		t.Errorf("search_strategy must say it is discovery: %q", d["search_strategy"])
	}
	if !strings.Contains(strings.ToLower(d["get_section"]), "authoritative") {
		t.Errorf("get_section must say it is authoritative: %q", d["get_section"])
	}
}
