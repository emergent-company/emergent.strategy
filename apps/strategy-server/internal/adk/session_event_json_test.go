package adk

import (
	"encoding/json"
	"testing"
	"time"

	adkmodel "google.golang.org/adk/v2/model"
	adksession "google.golang.org/adk/v2/session"
	"google.golang.org/genai"
)

// TestSessionEvent_JSONRoundTripIsLossless guards the assumption the session
// store is built on: events are persisted as a single JSONB document rather
// than decomposed into columns.
//
// If an ADK upgrade breaks Event JSON round-tripping, persistence would corrupt
// silently — a resumed run would come back with missing content, state deltas,
// or timestamps. This test fails loudly instead.
func TestSessionEvent_JSONRoundTripIsLossless(t *testing.T) {
	orig := &adksession.Event{
		LLMResponse: adkmodel.LLMResponse{
			Content:      &genai.Content{Role: "model", Parts: []*genai.Part{{Text: "hi"}}},
			TurnComplete: true,
			UsageMetadata: &genai.GenerateContentResponseUsageMetadata{
				PromptTokenCount: 5, CandidatesTokenCount: 7,
			},
		},
		ID:           "ev-1",
		Timestamp:    time.Now().UTC().Truncate(time.Microsecond),
		InvocationID: "inv-1",
		Author:       "agent",
		Branch:       "a.b",
		Actions:      adksession.EventActions{StateDelta: map[string]any{"k": "v"}},
	}

	b, err := json.Marshal(orig)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var got adksession.Event
	if err := json.Unmarshal(b, &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if got.ID != orig.ID || got.Author != orig.Author || got.InvocationID != orig.InvocationID {
		t.Errorf("identity fields lost: %+v", got)
	}
	if got.Branch != orig.Branch {
		t.Errorf("Branch=%q want %q", got.Branch, orig.Branch)
	}
	if !got.Timestamp.Equal(orig.Timestamp) {
		t.Errorf("Timestamp=%v want %v", got.Timestamp, orig.Timestamp)
	}
	if got.Content == nil || len(got.Content.Parts) != 1 || got.Content.Parts[0].Text != "hi" {
		t.Errorf("Content lost: %+v", got.Content)
	}
	if !got.TurnComplete {
		t.Error("TurnComplete lost")
	}
	if got.UsageMetadata == nil || got.UsageMetadata.PromptTokenCount != 5 {
		t.Errorf("UsageMetadata lost: %+v", got.UsageMetadata)
	}
	if v, ok := got.Actions.StateDelta["k"]; !ok || v != "v" {
		t.Errorf("Actions.StateDelta lost: %+v", got.Actions)
	}
	t.Logf("round-trip OK; payload=%d bytes", len(b))
}
