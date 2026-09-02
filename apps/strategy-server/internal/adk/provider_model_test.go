package adk

import (
	"context"
	"errors"
	"testing"

	adkmodel "google.golang.org/adk/v2/model"
	"google.golang.org/genai"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/llm"
)

// fakeProvider records what the adapter passed down and returns a canned result.
type fakeProvider struct {
	gotMessages []llm.ChatMessage
	gotTemp     float64
	gotFormat   *llm.ResponseFormat
	result      *llm.ChatResult
	err         error
	model       string
}

func (f *fakeProvider) Chat(ctx context.Context, msgs []llm.ChatMessage, temp float64) (*llm.ChatResult, error) {
	return f.ChatWithFormat(ctx, msgs, temp, nil)
}

func (f *fakeProvider) ChatWithFormat(_ context.Context, msgs []llm.ChatMessage, temp float64, format *llm.ResponseFormat) (*llm.ChatResult, error) {
	f.gotMessages, f.gotTemp, f.gotFormat = msgs, temp, format
	if f.err != nil {
		return nil, f.err
	}
	return f.result, nil
}

func (f *fakeProvider) Ping(context.Context) error { return nil }
func (f *fakeProvider) Model() string              { return f.model }

func newFake() *fakeProvider {
	return &fakeProvider{
		model:  "test-model",
		result: &llm.ChatResult{Content: "hello", InputTokens: 7, OutputTokens: 11},
	}
}

func userContent(text string) *genai.Content {
	return &genai.Content{Role: genaiRoleUser, Parts: []*genai.Part{{Text: text}}}
}

// collect drains the single-response iterator the adapter returns.
func collect(t *testing.T, seq func(func(*adkmodel.LLMResponse, error) bool)) ([]*adkmodel.LLMResponse, []error) {
	t.Helper()
	var resps []*adkmodel.LLMResponse
	var errs []error
	seq(func(r *adkmodel.LLMResponse, err error) bool {
		resps = append(resps, r)
		errs = append(errs, err)
		return true
	})
	return resps, errs
}

func TestProviderModel_Name(t *testing.T) {
	m := NewProviderModel(newFake())
	if got := m.Name(); got != "test-model" {
		t.Errorf("Name()=%q, want test-model", got)
	}
}

func TestNewProviderModel_NilProviderYieldsNil(t *testing.T) {
	// Mirrors the llm.Provider nil contract: the LLM is optional, so a nil
	// provider must produce a nil adapter rather than one that panics on use.
	if m := NewProviderModel(nil); m != nil {
		t.Errorf("NewProviderModel(nil)=%v, want nil", m)
	}
}

func TestProviderModel_GenerateContent_HappyPath(t *testing.T) {
	f := newFake()
	m := NewProviderModel(f)

	temp := float32(0.4)
	req := &adkmodel.LLMRequest{
		Contents: []*genai.Content{userContent("hi there")},
		Config: &genai.GenerateContentConfig{
			SystemInstruction: &genai.Content{Parts: []*genai.Part{{Text: "be terse"}}},
			Temperature:       &temp,
		},
	}

	resps, errs := collect(t, m.GenerateContent(t.Context(), req, false))

	if len(resps) != 1 {
		t.Fatalf("got %d responses, want exactly 1 (the seam is non-streaming)", len(resps))
	}
	if errs[0] != nil {
		t.Fatalf("unexpected error: %v", errs[0])
	}

	// Request translation.
	want := []llm.ChatMessage{
		{Role: "system", Content: "be terse"},
		{Role: "user", Content: "hi there"},
	}
	if len(f.gotMessages) != len(want) {
		t.Fatalf("messages=%+v, want %+v", f.gotMessages, want)
	}
	for i := range want {
		if f.gotMessages[i] != want[i] {
			t.Errorf("message[%d]=%+v, want %+v", i, f.gotMessages[i], want[i])
		}
	}
	// genai stores temperature as *float32, so widening to float64 cannot
	// reproduce 0.4 exactly. Compare against the same widening rather than the
	// literal — rounding here would invent precision the source never had.
	if f.gotTemp != float64(temp) {
		t.Errorf("temperature=%v, want %v", f.gotTemp, float64(temp))
	}

	// Response translation.
	r := resps[0]
	if got := contentText(r.Content); got != "hello" {
		t.Errorf("response text=%q, want hello", got)
	}
	if r.Content.Role != genaiRoleModel {
		t.Errorf("response role=%q, want %q", r.Content.Role, genaiRoleModel)
	}
	if !r.TurnComplete || r.Partial {
		t.Errorf("TurnComplete=%v Partial=%v, want true/false — a single yield is a complete turn",
			r.TurnComplete, r.Partial)
	}
	if r.ModelVersion != "test-model" {
		t.Errorf("ModelVersion=%q, want test-model", r.ModelVersion)
	}
	if r.UsageMetadata.PromptTokenCount != 7 || r.UsageMetadata.CandidatesTokenCount != 11 {
		t.Errorf("tokens=(%d,%d), want (7,11)",
			r.UsageMetadata.PromptTokenCount, r.UsageMetadata.CandidatesTokenCount)
	}
	if r.UsageMetadata.TotalTokenCount != 18 {
		t.Errorf("TotalTokenCount=%d, want 18", r.UsageMetadata.TotalTokenCount)
	}
}

// TestProviderModel_ErrorIsPropagatedUnwrapped guards the contract that lets
// ADK nodes branch on provider failures exactly like domain callers do. If the
// adapter wrapped the error, llm.IsRetryable / IsAccessDenied would stop working
// and a rate-limit would look like a permanent failure.
func TestProviderModel_ErrorIsPropagatedUnwrapped(t *testing.T) {
	f := newFake()
	f.err = &llm.APIError{Kind: llm.KindRateLimited, Retryable: true, Message: "slow down"}
	m := NewProviderModel(f)

	_, errs := collect(t, m.GenerateContent(t.Context(),
		&adkmodel.LLMRequest{Contents: []*genai.Content{userContent("hi")}}, false))

	err := errs[0]
	if err == nil {
		t.Fatal("expected an error")
	}
	if !llm.IsRetryable(err) {
		t.Error("llm.IsRetryable()=false — the classified error contract was lost in translation")
	}
	var apiErr *llm.APIError
	if !errors.As(err, &apiErr) {
		t.Fatalf("error is not *llm.APIError: %T", err)
	}
}

func TestProviderModel_JSONModeMapping(t *testing.T) {
	tests := []struct {
		name     string
		mimeType string
		want     *llm.ResponseFormat
	}{
		{"json mime requests JSON format", jsonMIMEType, llm.FormatJSON},
		{"text mime uses plain text", "text/plain", nil},
		{"unset mime uses plain text", "", nil},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			f := newFake()
			m := NewProviderModel(f)

			_, _ = collect(t, m.GenerateContent(t.Context(), &adkmodel.LLMRequest{
				Contents: []*genai.Content{userContent("hi")},
				Config:   &genai.GenerateContentConfig{ResponseMIMEType: tc.mimeType},
			}, false))

			if f.gotFormat != tc.want {
				t.Errorf("format=%v, want %v", f.gotFormat, tc.want)
			}
		})
	}
}

func TestRequestToMessages(t *testing.T) {
	tests := []struct {
		name    string
		req     *adkmodel.LLMRequest
		want    []llm.ChatMessage
		wantErr string
	}{
		{
			name: "genai model role maps to assistant",
			req: &adkmodel.LLMRequest{Contents: []*genai.Content{
				userContent("u1"),
				{Role: genaiRoleModel, Parts: []*genai.Part{{Text: "m1"}}},
			}},
			want: []llm.ChatMessage{
				{Role: "user", Content: "u1"},
				{Role: "assistant", Content: "m1"},
			},
		},
		{
			name: "empty role defaults to user",
			req:  &adkmodel.LLMRequest{Contents: []*genai.Content{{Parts: []*genai.Part{{Text: "x"}}}}},
			want: []llm.ChatMessage{{Role: "user", Content: "x"}},
		},
		{
			name: "multiple parts are concatenated",
			req: &adkmodel.LLMRequest{Contents: []*genai.Content{
				{Role: genaiRoleUser, Parts: []*genai.Part{{Text: "a"}, {Text: "b"}}},
			}},
			want: []llm.ChatMessage{{Role: "user", Content: "ab"}},
		},
		{
			name: "content with no text is skipped",
			req: &adkmodel.LLMRequest{Contents: []*genai.Content{
				{Role: genaiRoleUser, Parts: []*genai.Part{{Text: ""}}},
				userContent("real"),
			}},
			want: []llm.ChatMessage{{Role: "user", Content: "real"}},
		},
		{
			name: "nil content entries are skipped",
			req:  &adkmodel.LLMRequest{Contents: []*genai.Content{nil, userContent("real")}},
			want: []llm.ChatMessage{{Role: "user", Content: "real"}},
		},
		{
			name:    "no text anywhere is an error",
			req:     &adkmodel.LLMRequest{Contents: []*genai.Content{}},
			wantErr: "no text content",
		},
		{
			name: "empty system instruction is not emitted",
			req: &adkmodel.LLMRequest{
				Contents: []*genai.Content{userContent("u")},
				Config:   &genai.GenerateContentConfig{SystemInstruction: &genai.Content{}},
			},
			want: []llm.ChatMessage{{Role: "user", Content: "u"}},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := requestToMessages(tc.req)

			if tc.wantErr != "" {
				if err == nil {
					t.Fatalf("expected an error containing %q", tc.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if len(got) != len(tc.want) {
				t.Fatalf("messages=%+v, want %+v", got, tc.want)
			}
			for i := range tc.want {
				if got[i] != tc.want[i] {
					t.Errorf("message[%d]=%+v, want %+v", i, got[i], tc.want[i])
				}
			}
		})
	}
}

func TestProviderModel_NilRequestIsAnError(t *testing.T) {
	m := NewProviderModel(newFake())

	_, errs := collect(t, m.GenerateContent(t.Context(), nil, false))

	if errs[0] == nil {
		t.Error("expected an error for a nil request")
	}
}

// TestProviderModel_StreamFlagDoesNotChangeBehaviour documents that the seam is
// non-streaming: ADK may ask for streaming, but a single complete response is a
// valid answer and must stay valid.
func TestProviderModel_StreamFlagDoesNotChangeBehaviour(t *testing.T) {
	for _, stream := range []bool{false, true} {
		f := newFake()
		m := NewProviderModel(f)

		resps, errs := collect(t, m.GenerateContent(t.Context(),
			&adkmodel.LLMRequest{Contents: []*genai.Content{userContent("hi")}}, stream))

		if errs[0] != nil {
			t.Fatalf("stream=%v: unexpected error: %v", stream, errs[0])
		}
		if len(resps) != 1 {
			t.Errorf("stream=%v: got %d responses, want 1", stream, len(resps))
		}
		if !resps[0].TurnComplete {
			t.Errorf("stream=%v: TurnComplete=false, want true", stream)
		}
	}
}
