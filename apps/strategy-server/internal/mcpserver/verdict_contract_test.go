package mcpserver_test

// Contract tests for the validation verdict envelope.
//
// These assert the properties a consumer actually depends on:
//   - structuredContent validates against the schema the server itself
//     advertises, not against a copy written here (a hand-copied expectation
//     cannot catch drift — it drifts with the code);
//   - finding problems is a successful call, never isError;
//   - the pre-existing text content is unchanged, so the addition cannot
//     break anyone reading it today.

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/santhosh-tekuri/jsonschema/v6"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/mcpserver"
)

// verdictTools is the set that must publish the envelope. health_check is
// deliberately absent: it reports completeness, not a verdict.
var verdictTools = []string{
	"validate_artifact",
	"validate_instance",
	"validate_relationships",
	"validate_with_plan",
	"check_content_readiness",
	"validate_value_model_links",
}

// publishedOutputSchema returns the compiled outputSchema the server actually
// advertises for a tool.
func publishedOutputSchema(t *testing.T, toolName string) *jsonschema.Schema {
	t.Helper()

	srv := mcpserver.NewMCPServerForIntrospection()
	for _, st := range srv.ListTools() {
		if st.Tool.Name != toolName {
			continue
		}
		if st.Tool.OutputSchema.Type == "" {
			t.Fatalf("tool %q publishes no outputSchema", toolName)
		}
		raw, err := json.Marshal(st.Tool.OutputSchema)
		if err != nil {
			t.Fatalf("marshal outputSchema for %q: %v", toolName, err)
		}
		doc, err := jsonschema.UnmarshalJSON(bytes.NewReader(raw))
		if err != nil {
			t.Fatalf("parse outputSchema for %q: %v", toolName, err)
		}
		c := jsonschema.NewCompiler()
		if err := c.AddResource("out.json", doc); err != nil {
			t.Fatalf("register outputSchema for %q: %v", toolName, err)
		}
		sch, err := c.Compile("out.json")
		if err != nil {
			t.Fatalf("compile outputSchema for %q: %v", toolName, err)
		}
		return sch
	}
	t.Fatalf("tool %q is not registered", toolName)
	return nil
}

// TestVerdict_EveryVerdictToolPublishesAnOutputSchema guards the set itself. A new
// validation tool added without an envelope, or health_check quietly acquiring
// one, both fail here.
func TestVerdict_EveryVerdictToolPublishesAnOutputSchema(t *testing.T) {
	srv := mcpserver.NewMCPServerForIntrospection()

	publishing := map[string]bool{}
	for _, st := range srv.ListTools() {
		if st.Tool.OutputSchema.Type != "" {
			publishing[st.Tool.Name] = true
		}
	}

	for _, name := range verdictTools {
		if !publishing[name] {
			t.Errorf("%s publishes no outputSchema — consumers cannot discover the envelope", name)
		}
		delete(publishing, name)
	}
	for name := range publishing {
		t.Errorf("%s publishes an outputSchema but is not a declared verdict tool — "+
			"either add it to verdictTools or reconsider whether it renders a judgement", name)
	}
}

// rawToolCall performs a tools/call and returns the decoded JSON-RPC result,
// preserving structuredContent and isError, which the shared helper drops.
func rawToolCall(t *testing.T, c *mcpClient, id int, tool string, args map[string]any) (structured json.RawMessage, text string, isError bool) {
	t.Helper()

	argsJSON, _ := json.Marshal(args)
	body := fmt.Sprintf(
		`{"jsonrpc":"2.0","id":%d,"method":"tools/call","params":{"name":%q,"arguments":%s}}`,
		id, tool, argsJSON,
	)
	req, _ := http.NewRequest(http.MethodPost, c.server.URL+"/mcp", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	req.Header.Set("Mcp-Session-Id", c.sessionID)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("tool %s: %v", tool, err)
	}
	defer resp.Body.Close() //nolint:errcheck
	raw, _ := io.ReadAll(resp.Body)

	var envelope struct {
		Result struct {
			Content []struct {
				Text string `json:"text"`
			} `json:"content"`
			StructuredContent json.RawMessage `json:"structuredContent"`
			IsError           bool            `json:"isError"`
		} `json:"result"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(jsonRPCPayload(raw), &envelope); err != nil {
		t.Fatalf("tool %s: parse: %v\nbody: %s", tool, err, raw)
	}
	if envelope.Error != nil {
		t.Fatalf("tool %s: protocol error: %s", tool, envelope.Error.Message)
	}
	if len(envelope.Result.Content) > 0 {
		text = envelope.Result.Content[0].Text
	}
	return envelope.Result.StructuredContent, text, envelope.Result.IsError
}

func assertValidatesAgainstPublishedSchema(t *testing.T, tool string, structured json.RawMessage) {
	t.Helper()

	if len(structured) == 0 {
		t.Fatalf("%s returned no structuredContent", tool)
	}
	inst, err := jsonschema.UnmarshalJSON(bytes.NewReader(structured))
	if err != nil {
		t.Fatalf("%s: structuredContent is not valid JSON: %v", tool, err)
	}
	if err := publishedOutputSchema(t, tool).Validate(inst); err != nil {
		t.Errorf("%s: structuredContent does not satisfy the outputSchema the server advertises: %v\npayload: %s",
			tool, err, structured)
	}
}

// TestVerdict_InvalidSubjectIsStillASuccessfulCall is the invariant the whole
// design rests on. validate_instance is a query — "what is the validation
// state?" — and a dashboard or surveying agent must be able to ask it whatever
// the answer is. Turning an invalid subject into isError would remove that.
func TestVerdict_InvalidSubjectIsStillASuccessfulCall(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)

	// north_star is one of the artifact types with a registered schema, so a
	// payload of the wrong shape genuinely fails validation. The nested
	// "vision" value is the wrong type, which produces a finding with a
	// non-root path.
	_, instID := seedInstance(t, svc, "verdict-invalid-"+uuid.New().String()[:8], map[string]any{
		"north_star": map[string]any{
			"north_star": map[string]any{"vision": "should be an object, not a string"},
			"bogus":      "additional property the schema forbids",
		},
	})

	structured, text, isError := rawToolCall(t, c, 1, "validate_instance", map[string]any{
		"instance_id": instID.String(),
	})

	if isError {
		t.Fatalf("validate_instance set isError for an invalid instance. isError means the CALL failed; "+
			"an invalid subject is a successful answer to a legitimate question.\ntext: %s", text)
	}
	assertValidatesAgainstPublishedSchema(t, "validate_instance", structured)

	var v struct {
		OK       bool                         `json:"ok"`
		Counts   struct{ Error, Checked int } `json:"counts"`
		Findings []struct {
			Severity, Key, Rule, Path, Message string
		} `json:"findings"`
	}
	if err := json.Unmarshal(structured, &v); err != nil {
		t.Fatalf("decode verdict: %v", err)
	}
	if v.OK {
		t.Error("ok = true for an instance containing an invalid artifact")
	}
	if len(v.Findings) == 0 {
		t.Fatal("no findings for an invalid instance — a consumer has nothing to act on")
	}
	sawPath := false
	for i, f := range v.Findings {
		if f.Severity == "" {
			t.Errorf("finding %d has no severity; a known consumer treats that as blocking", i)
		}
		if f.Rule == "" {
			t.Errorf("finding %d has no rule; consumers baseline on (key, rule, path)", i)
		}
		if !strings.HasPrefix(f.Rule, "schema.") {
			t.Errorf("finding %d rule = %q, want a namespaced schema.* id", i, f.Rule)
		}
		if f.Message == "" {
			t.Errorf("finding %d has no message; consumers render findings as 'key: message'", i)
		}
		if f.Key != "north_star" {
			t.Errorf("finding %d key = %q, want the artifact key so a consumer can attribute it", i, f.Key)
		}
		if f.Path != "" {
			sawPath = true
		}
	}
	if !sawPath {
		t.Error("no finding carried a path — a violation nested inside the payload must report where it is, " +
			"or (key, rule, path) cannot distinguish two violations of the same rule in one artifact")
	}
}

// TestVerdict_CallFailureStillUsesIsError — the other half of the contract.
// Reserving isError for real failure is only meaningful if real failures
// still use it.
func TestVerdict_CallFailureStillUsesIsError(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)

	_, _, isError := rawToolCall(t, c, 1, "validate_instance", map[string]any{
		"instance_id": "not-a-uuid",
	})
	if !isError {
		t.Error("validate_instance with a malformed instance_id did not set isError — " +
			"the call genuinely could not be performed, which is exactly what isError is for")
	}
}

// TestVerdict_CleanSubjectReportsOK covers the other branch, including that
// counts.checked is populated so "clean" is distinguishable from "nothing ran".
func TestVerdict_CleanSubjectReportsOK(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)

	structured, text, isError := rawToolCall(t, c, 1, "validate_artifact", map[string]any{
		"payload":       `{"track_name":"product","maturity_stages":[],"value_paths":[]}`,
		"artifact_type": "value_model",
	})
	if isError {
		t.Fatalf("validate_artifact set isError on a well-formed call: %s", text)
	}
	assertValidatesAgainstPublishedSchema(t, "validate_artifact", structured)

	var v struct {
		OK     bool `json:"ok"`
		Counts struct {
			Checked int `json:"checked"`
		} `json:"counts"`
	}
	if err := json.Unmarshal(structured, &v); err != nil {
		t.Fatalf("decode verdict: %v", err)
	}
	if v.Counts.Checked == 0 {
		t.Error("counts.checked = 0 for a call that examined a payload; " +
			"a consumer cannot then tell a clean result from one where nothing ran")
	}
}

// TestVerdict_ReadinessNeverBlocks pins the deliberate asymmetry: readiness is
// a score, and deciding which score fails is the consumer's policy, so every
// readiness finding is a warning and ok stays true.
func TestVerdict_ReadinessNeverBlocks(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)

	_, instID := seedInstance(t, svc, "verdict-readiness-"+uuid.New().String()[:8], map[string]any{
		"feature": map[string]any{"feature_id": "fd-001", "name": "Bare feature"},
	})

	structured, text, isError := rawToolCall(t, c, 1, "check_content_readiness", map[string]any{
		"instance_id": instID.String(),
	})
	if isError {
		t.Fatalf("check_content_readiness set isError: %s", text)
	}
	assertValidatesAgainstPublishedSchema(t, "check_content_readiness", structured)

	var v struct {
		OK       bool `json:"ok"`
		Findings []struct {
			Severity string `json:"severity"`
			Rule     string `json:"rule"`
		} `json:"findings"`
	}
	if err := json.Unmarshal(structured, &v); err != nil {
		t.Fatalf("decode verdict: %v", err)
	}
	for _, f := range v.Findings {
		if f.Rule == "readiness.missing_field" && f.Severity != "warning" {
			t.Errorf("missing-field finding has severity %q, want warning — "+
				"treating low readiness as an error makes the server pick a quality bar it does not own",
				f.Severity)
		}
	}
	if !v.OK && len(v.Findings) > 0 {
		allWarnings := true
		for _, f := range v.Findings {
			if f.Severity == "error" {
				allWarnings = false
			}
		}
		if allWarnings {
			t.Error("ok = false with no error-severity findings")
		}
	}
}

// TestVerdict_TextContentIsStillTheOldBody proves the change is additive: the
// pre-existing response is untouched, so a consumer reading text keeps working.
func TestVerdict_TextContentIsStillTheOldBody(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)

	_, instID := seedInstance(t, svc, "verdict-text-"+uuid.New().String()[:8], map[string]any{
		"feature": map[string]any{"feature_id": "fd-001", "name": "A feature"},
	})

	_, text, _ := rawToolCall(t, c, 1, "validate_instance", map[string]any{
		"instance_id": instID.String(),
	})

	var legacy struct {
		InstanceID    string `json:"instance_id"`
		ArtifactCount int    `json:"artifact_count"`
		InvalidCount  *int   `json:"invalid_count"`
		Results       []any  `json:"results"`
	}
	if err := json.Unmarshal([]byte(text), &legacy); err != nil {
		t.Fatalf("text content is no longer the original JSON body: %v\ntext: %s", err, text)
	}
	if legacy.InstanceID != instID.String() {
		t.Errorf("instance_id = %q, want %q", legacy.InstanceID, instID)
	}
	if legacy.InvalidCount == nil {
		t.Error("invalid_count is gone from the text body — existing consumers read this field")
	}
	if legacy.Results == nil {
		t.Error("results is gone from the text body — existing consumers read this field")
	}
}
