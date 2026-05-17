package ripple

import (
	"encoding/json"
	"testing"
)

func TestParseResolveResponse_Updated(t *testing.T) {
	response := `{
		"updated": true,
		"new_payload": {"name": "Updated Feature", "description": "Tightened alignment"},
		"explanation": "Updated description to match North Star direction",
		"distance": 0.05
	}`

	result, err := parseResolveResponse(response)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if !result.Updated {
		t.Error("expected updated=true")
	}
	if result.Distance != 0.05 {
		t.Errorf("distance=%f, want 0.05", result.Distance)
	}
	if result.Explanation == "" {
		t.Error("expected non-empty explanation")
	}
	if !json.Valid(result.NewPayload) {
		t.Error("new_payload should be valid JSON")
	}
}

func TestParseResolveResponse_NotUpdated(t *testing.T) {
	response := `{
		"updated": false,
		"explanation": "Artifact is already aligned"
	}`

	result, err := parseResolveResponse(response)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if result.Updated {
		t.Error("expected updated=false")
	}
	if result.NewPayload != nil {
		t.Error("expected nil payload when not updated")
	}
}

func TestParseResolveResponse_MarkdownWrapped(t *testing.T) {
	response := "```json\n" + `{
		"updated": true,
		"new_payload": {"name": "Fixed"},
		"explanation": "Fix applied",
		"distance": 0.03
	}` + "\n```"

	result, err := parseResolveResponse(response)
	if err != nil {
		t.Fatalf("parse markdown-wrapped: %v", err)
	}
	if !result.Updated {
		t.Error("expected updated=true from markdown-wrapped response")
	}
}

func TestParseResolveResponse_WithPreamble(t *testing.T) {
	response := "Here is the fix:\n\n" + `{
		"updated": true,
		"new_payload": {"name": "Fixed"},
		"explanation": "Applied fix",
		"distance": 0.02
	}`

	result, err := parseResolveResponse(response)
	if err != nil {
		t.Fatalf("parse with preamble: %v", err)
	}
	if !result.Updated {
		t.Error("expected updated=true despite preamble text")
	}
}

func TestParseResolveResponse_DistanceClamped(t *testing.T) {
	response := `{
		"updated": true,
		"new_payload": {"name": "Fixed"},
		"explanation": "Big change",
		"distance": 1.5
	}`

	result, err := parseResolveResponse(response)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if result.Distance != 1.0 {
		t.Errorf("distance=%f, want 1.0 (clamped)", result.Distance)
	}
}

func TestParseResolveResponse_InvalidJSON(t *testing.T) {
	response := "This is not JSON at all, just plain text explaining something."

	_, err := parseResolveResponse(response)
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestExtractJSON_Various(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{"plain json", `{"foo": 1}`, `{"foo": 1}`},
		{"markdown fenced", "```json\n{\"foo\": 1}\n```", `{"foo": 1}`},
		{"bare fenced", "```\n{\"foo\": 1}\n```", `{"foo": 1}`},
		{"with preamble", "Here:\n{\"foo\": 1}", `{"foo": 1}`},
		{"with suffix", "{\"foo\": 1}\nDone.", `{"foo": 1}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractJSON(tt.input)
			// Parse both to compare structurally.
			var gotObj, wantObj any
			if err := json.Unmarshal([]byte(got), &gotObj); err != nil {
				t.Fatalf("parse extracted: %v (got %q)", err, got)
			}
			if err := json.Unmarshal([]byte(tt.want), &wantObj); err != nil {
				t.Fatalf("parse expected: %v", err)
			}
		})
	}
}

func TestBuildSystemPrompt(t *testing.T) {
	prompt := buildSystemPrompt()
	if prompt == "" {
		t.Fatal("system prompt should not be empty")
	}
	// Should contain key instructions.
	keywords := []string{
		"PRESERVE",
		"SMALLEST change",
		"new_payload",
		"distance",
		"updated",
	}
	for _, kw := range keywords {
		if !contains(prompt, kw) {
			t.Errorf("system prompt missing keyword %q", kw)
		}
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && searchString(s, substr)
}

func searchString(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
