package llm

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/bedrockruntime"
	brtypes "github.com/aws/aws-sdk-go-v2/service/bedrockruntime/types"
	"github.com/aws/smithy-go"
)

// fakeInvoker records the last request and returns a canned response or error.
type fakeInvoker struct {
	lastInput *bedrockruntime.InvokeModelInput
	respBody  string
	err       error
}

func (f *fakeInvoker) InvokeModel(_ context.Context, in *bedrockruntime.InvokeModelInput, _ ...func(*bedrockruntime.Options)) (*bedrockruntime.InvokeModelOutput, error) {
	f.lastInput = in
	if f.err != nil {
		return nil, f.err
	}
	return &bedrockruntime.InvokeModelOutput{Body: []byte(f.respBody)}, nil
}

func newTestBedrock(f *fakeInvoker) *bedrockProvider {
	return &bedrockProvider{
		client:    f,
		model:     "eu.anthropic.claude-3-5-sonnet-20241022-v2:0",
		region:    "eu-central-1",
		maxTokens: 4096,
	}
}

// decodeRequest unmarshals the body the provider sent to Bedrock.
func decodeRequest(t *testing.T, in *bedrockruntime.InvokeModelInput) anthropicRequest {
	t.Helper()
	if in == nil {
		t.Fatal("no request was sent to Bedrock")
	}
	var req anthropicRequest
	if err := json.Unmarshal(in.Body, &req); err != nil {
		t.Fatalf("unmarshal sent request: %v", err)
	}
	return req
}

const okResponse = `{
  "content":[{"type":"text","text":"hello world"}],
  "stop_reason":"end_turn",
  "usage":{"input_tokens":11,"output_tokens":22}
}`

func TestBedrock_ChatSuccess(t *testing.T) {
	f := &fakeInvoker{respBody: okResponse}
	p := newTestBedrock(f)

	res, err := p.Chat(t.Context(), []ChatMessage{
		{Role: "system", Content: "be terse"},
		{Role: "user", Content: "hi"},
	}, 0.3)
	if err != nil {
		t.Fatalf("Chat: %v", err)
	}

	if res.Content != "hello world" {
		t.Errorf("Content=%q, want %q", res.Content, "hello world")
	}
	if res.InputTokens != 11 || res.OutputTokens != 22 {
		t.Errorf("tokens=(%d,%d), want (11,22)", res.InputTokens, res.OutputTokens)
	}

	req := decodeRequest(t, f.lastInput)
	if req.AnthropicVersion != anthropicVersion {
		t.Errorf("anthropic_version=%q, want %q", req.AnthropicVersion, anthropicVersion)
	}
	if req.System != "be terse" {
		t.Errorf("system=%q, want %q — system must be hoisted out of messages", req.System, "be terse")
	}
	if len(req.Messages) != 1 || req.Messages[0].Role != "user" {
		t.Fatalf("messages=%+v, want a single user message", req.Messages)
	}
	if req.MaxTokens != 4096 {
		t.Errorf("max_tokens=%d, want 4096 (Anthropic requires it)", req.MaxTokens)
	}
	if req.Temperature != 0.3 {
		t.Errorf("temperature=%v, want 0.3", req.Temperature)
	}
	if got := aws.ToString(f.lastInput.ModelId); got != p.model {
		t.Errorf("ModelId=%q, want %q", got, p.model)
	}
}

func TestBedrock_JSONModeAppendsInstruction(t *testing.T) {
	f := &fakeInvoker{respBody: okResponse}
	p := newTestBedrock(f)

	if _, err := p.ChatWithFormat(t.Context(), []ChatMessage{
		{Role: "system", Content: "be terse"},
		{Role: "user", Content: "give me json"},
	}, 0, FormatJSON); err != nil {
		t.Fatalf("ChatWithFormat: %v", err)
	}

	req := decodeRequest(t, f.lastInput)
	if !strings.Contains(req.System, "be terse") {
		t.Error("original system prompt was dropped")
	}
	if !strings.Contains(req.System, "valid JSON object") {
		t.Errorf("JSON instruction not appended; system=%q", req.System)
	}
}

func TestBedrock_TextFormatOmitsJSONInstruction(t *testing.T) {
	f := &fakeInvoker{respBody: okResponse}
	p := newTestBedrock(f)

	if _, err := p.ChatWithFormat(t.Context(), []ChatMessage{
		{Role: "user", Content: "hi"},
	}, 0, FormatText); err != nil {
		t.Fatalf("ChatWithFormat: %v", err)
	}

	req := decodeRequest(t, f.lastInput)
	if strings.Contains(req.System, "valid JSON object") {
		t.Error("JSON instruction leaked into a text-format request")
	}
}

func TestBedrock_PingUsesMinimalTokens(t *testing.T) {
	f := &fakeInvoker{respBody: okResponse}
	p := newTestBedrock(f)

	if err := p.Ping(t.Context()); err != nil {
		t.Fatalf("Ping: %v", err)
	}

	req := decodeRequest(t, f.lastInput)
	if req.MaxTokens != 1 {
		t.Errorf("Ping max_tokens=%d, want 1 — preflight must stay cheap", req.MaxTokens)
	}
}

func TestBedrock_MultipleTextBlocksAreJoined(t *testing.T) {
	f := &fakeInvoker{respBody: `{
      "content":[
        {"type":"text","text":"part one "},
        {"type":"tool_use","text":"IGNORED"},
        {"type":"text","text":"part two"}
      ],
      "usage":{"input_tokens":1,"output_tokens":2}
    }`}
	p := newTestBedrock(f)

	res, err := p.Chat(t.Context(), []ChatMessage{{Role: "user", Content: "hi"}}, 0)
	if err != nil {
		t.Fatalf("Chat: %v", err)
	}
	if res.Content != "part one part two" {
		t.Errorf("Content=%q, want %q (non-text blocks must be skipped)", res.Content, "part one part two")
	}
}

func TestTranslateMessages(t *testing.T) {
	tests := []struct {
		name       string
		in         []ChatMessage
		wantSystem string
		wantMsgs   []anthropicMessage
		wantErr    string
	}{
		{
			name: "system hoisted, user retained",
			in: []ChatMessage{
				{Role: "system", Content: "sys"},
				{Role: "user", Content: "u1"},
			},
			wantSystem: "sys",
			wantMsgs:   []anthropicMessage{{Role: "user", Content: "u1"}},
		},
		{
			name: "multiple system messages concatenated",
			in: []ChatMessage{
				{Role: "system", Content: "a"},
				{Role: "system", Content: "b"},
				{Role: "user", Content: "u"},
			},
			wantSystem: "a\n\nb",
			wantMsgs:   []anthropicMessage{{Role: "user", Content: "u"}},
		},
		{
			name: "consecutive same-role messages merged for strict alternation",
			in: []ChatMessage{
				{Role: "user", Content: "u1"},
				{Role: "user", Content: "u2"},
				{Role: "assistant", Content: "a1"},
			},
			wantSystem: "",
			wantMsgs: []anthropicMessage{
				{Role: "user", Content: "u1\n\nu2"},
				{Role: "assistant", Content: "a1"},
			},
		},
		{
			name:       "alternating conversation preserved",
			in:         []ChatMessage{{Role: "user", Content: "u1"}, {Role: "assistant", Content: "a1"}, {Role: "user", Content: "u2"}},
			wantSystem: "",
			wantMsgs: []anthropicMessage{
				{Role: "user", Content: "u1"},
				{Role: "assistant", Content: "a1"},
				{Role: "user", Content: "u2"},
			},
		},
		{
			name:    "system only is rejected",
			in:      []ChatMessage{{Role: "system", Content: "sys"}},
			wantErr: "at least one",
		},
		{
			name:    "leading assistant is rejected",
			in:      []ChatMessage{{Role: "assistant", Content: "a"}, {Role: "user", Content: "u"}},
			wantErr: "must be from user",
		},
		{
			name:    "unknown role is rejected",
			in:      []ChatMessage{{Role: "function", Content: "x"}},
			wantErr: "unsupported message role",
		},
		{
			name:       "empty system content is skipped",
			in:         []ChatMessage{{Role: "system", Content: ""}, {Role: "user", Content: "u"}},
			wantSystem: "",
			wantMsgs:   []anthropicMessage{{Role: "user", Content: "u"}},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			system, msgs, err := translateMessages(tc.in)

			if tc.wantErr != "" {
				if err == nil {
					t.Fatalf("expected error containing %q, got nil", tc.wantErr)
				}
				if !strings.Contains(err.Error(), tc.wantErr) {
					t.Fatalf("error=%q, want it to contain %q", err.Error(), tc.wantErr)
				}
				return
			}

			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if system != tc.wantSystem {
				t.Errorf("system=%q, want %q", system, tc.wantSystem)
			}
			if len(msgs) != len(tc.wantMsgs) {
				t.Fatalf("messages=%+v, want %+v", msgs, tc.wantMsgs)
			}
			for i := range msgs {
				if msgs[i] != tc.wantMsgs[i] {
					t.Errorf("message[%d]=%+v, want %+v", i, msgs[i], tc.wantMsgs[i])
				}
			}
		})
	}
}

func TestBedrock_ErrorMapping(t *testing.T) {
	msg := "boom"
	tests := []struct {
		name          string
		awsErr        error
		wantKind      ErrorKind
		wantRetryable bool
	}{
		{"access denied", &brtypes.AccessDeniedException{Message: &msg}, KindAccessDenied, false},
		{"throttling", &brtypes.ThrottlingException{Message: &msg}, KindRateLimited, true},
		{"quota exceeded", &brtypes.ServiceQuotaExceededException{Message: &msg}, KindRateLimited, true},
		{"not found", &brtypes.ResourceNotFoundException{Message: &msg}, KindModelNotFound, false},
		{"validation", &brtypes.ValidationException{Message: &msg}, KindBadRequest, false},
		{"model not ready", &brtypes.ModelNotReadyException{Message: &msg}, KindServerError, true},
		{"model timeout", &brtypes.ModelTimeoutException{Message: &msg}, KindServerError, true},
		{"service unavailable", &brtypes.ServiceUnavailableException{Message: &msg}, KindServerError, true},
		{"internal server", &brtypes.InternalServerException{Message: &msg}, KindServerError, true},
		{"model error", &brtypes.ModelErrorException{Message: &msg}, KindServerError, true},
		{"unclassified", errors.New("some transport failure"), KindUnknown, false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			p := newTestBedrock(&fakeInvoker{err: tc.awsErr})

			_, err := p.Chat(t.Context(), []ChatMessage{{Role: "user", Content: "hi"}}, 0)
			if err == nil {
				t.Fatal("expected an error")
			}

			var apiErr *APIError
			if !errors.As(err, &apiErr) {
				t.Fatalf("error is not *APIError: %T", err)
			}
			if apiErr.Kind != tc.wantKind {
				t.Errorf("Kind=%q, want %q", apiErr.Kind, tc.wantKind)
			}
			if apiErr.IsRetryable() != tc.wantRetryable {
				t.Errorf("IsRetryable()=%v, want %v", apiErr.IsRetryable(), tc.wantRetryable)
			}
			if apiErr.Action == "" {
				t.Error("Action is empty — every classified error must carry a remediation")
			}
			if apiErr.Model != p.model {
				t.Errorf("Model=%q, want %q", apiErr.Model, p.model)
			}
			if !strings.Contains(apiErr.Provider, "eu-central-1") {
				t.Errorf("Provider=%q, want it to name the region", apiErr.Provider)
			}
		})
	}
}

// fakeAPIError implements smithy.APIError so tests can assert that an error
// carrying an AWS service code is never misread as a credentials failure.
type fakeAPIError struct{ code, msg string }

func (e *fakeAPIError) Error() string                 { return e.code + ": " + e.msg }
func (e *fakeAPIError) ErrorCode() string             { return e.code }
func (e *fakeAPIError) ErrorMessage() string          { return e.msg }
func (e *fakeAPIError) ErrorFault() smithy.ErrorFault { return smithy.FaultServer }

// TestBedrock_CredentialFailureIsAccessDenied covers the failure an operator
// actually hits first: the AWS SDK cannot resolve credentials, so the request
// never reaches Bedrock.
//
// This must classify as KindAccessDenied, not KindUnknown. Callers use
// IsAccessDenied to decide that a run is blocked pending human intervention;
// misclassifying it as unknown produces a generic "inspect the raw error"
// message and hides the real remediation.
func TestBedrock_CredentialFailureIsAccessDenied(t *testing.T) {
	// Verbatim shape of the SDK error observed when no IMDS role is available.
	credErr := errors.New("operation error Bedrock Runtime: InvokeModel, get identity: " +
		"get credentials: failed to refresh cached credentials, no EC2 IMDS role found, " +
		"operation error ec2imds: GetMetadata, request canceled, context deadline exceeded")

	p := newTestBedrock(&fakeInvoker{err: credErr})

	_, err := p.Chat(t.Context(), []ChatMessage{{Role: "user", Content: "hi"}}, 0)
	if err == nil {
		t.Fatal("expected an error")
	}

	if !IsAccessDenied(err) {
		t.Errorf("IsAccessDenied()=false, want true for a credential-resolution failure; got %v", err)
	}
	if IsRetryable(err) {
		t.Error("a credentials failure must not be retryable")
	}

	var apiErr *APIError
	if !errors.As(err, &apiErr) {
		t.Fatalf("error is not *APIError: %T", err)
	}
	if !strings.Contains(apiErr.Action, "eu-central-1") {
		t.Errorf("Action should name the region; got %q", apiErr.Action)
	}
	if !strings.Contains(strings.ToLower(apiErr.Action), "credentials") {
		t.Errorf("Action should explain how to supply credentials; got %q", apiErr.Action)
	}
}

func TestIsCredentialsError(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{"imds role missing", errors.New("get identity: get credentials: no EC2 IMDS role found"), true},
		{"cached refresh failure", errors.New("failed to refresh cached credentials"), true},
		{"retrieve failure", errors.New("failed to retrieve credentials from SSO"), true},
		{"case insensitive", errors.New("Get Credentials: boom"), true},
		{"plain network error", errors.New("dial tcp: connection refused"), false},
		{"unrelated error", errors.New("something else went wrong"), false},
		{
			// An AWS service error means credentials resolved fine — the
			// structural check must win even if the message mentions creds.
			name: "service error is never a credentials failure",
			err:  &fakeAPIError{code: "AccessDeniedException", msg: "get credentials denied"},
			want: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := isCredentialsError(tc.err); got != tc.want {
				t.Errorf("isCredentialsError(%v)=%v, want %v", tc.err, got, tc.want)
			}
		})
	}
}

// TestBedrock_UnknownServiceErrorSurfacesCode ensures a service error outside
// the typed exception set still yields an actionable message carrying the AWS
// error code, rather than a bare "inspect the raw error".
func TestBedrock_UnknownServiceErrorSurfacesCode(t *testing.T) {
	p := newTestBedrock(&fakeInvoker{err: &fakeAPIError{code: "SomeNewException", msg: "unexpected"}})

	_, err := p.Chat(t.Context(), []ChatMessage{{Role: "user", Content: "hi"}}, 0)

	var apiErr *APIError
	if !errors.As(err, &apiErr) {
		t.Fatalf("error is not *APIError: %T", err)
	}
	if apiErr.Kind != KindUnknown {
		t.Errorf("Kind=%q, want %q", apiErr.Kind, KindUnknown)
	}
	if !strings.Contains(apiErr.Action, "SomeNewException") {
		t.Errorf("Action should surface the AWS error code; got %q", apiErr.Action)
	}
	if apiErr.Message != "unexpected" {
		t.Errorf("Message=%q, want the service message %q", apiErr.Message, "unexpected")
	}
}

// TestBedrock_AccessDeniedFlowsThroughSharedHelpers verifies the Bedrock
// provider participates in the same error contract the OpenAI client uses, so
// callers branch identically regardless of which provider is configured.
func TestBedrock_AccessDeniedFlowsThroughSharedHelpers(t *testing.T) {
	msg := "no entitlement"
	p := newTestBedrock(&fakeInvoker{err: &brtypes.AccessDeniedException{Message: &msg}})

	_, err := p.Chat(t.Context(), []ChatMessage{{Role: "user", Content: "hi"}}, 0)

	if !IsAccessDenied(err) {
		t.Error("IsAccessDenied()=false, want true")
	}
	if IsRetryable(err) {
		t.Error("IsRetryable()=true, want false for access-denied")
	}
}

func TestBedrock_ThrottlingIsRetryableViaSharedHelper(t *testing.T) {
	msg := "slow down"
	p := newTestBedrock(&fakeInvoker{err: &brtypes.ThrottlingException{Message: &msg}})

	_, err := p.Chat(t.Context(), []ChatMessage{{Role: "user", Content: "hi"}}, 0)

	if !IsRetryable(err) {
		t.Error("IsRetryable()=false, want true for throttling")
	}
	if IsAccessDenied(err) {
		t.Error("IsAccessDenied()=true, want false for throttling")
	}
}

// TestBedrock_BadMessageSequenceIsNotRetryable ensures a malformed prompt fails
// fast as a code bug rather than burning retries.
func TestBedrock_BadMessageSequenceIsNotRetryable(t *testing.T) {
	f := &fakeInvoker{respBody: okResponse}
	p := newTestBedrock(f)

	_, err := p.Chat(t.Context(), []ChatMessage{{Role: "system", Content: "only system"}}, 0)
	if err == nil {
		t.Fatal("expected an error for a system-only message list")
	}

	var apiErr *APIError
	if !errors.As(err, &apiErr) {
		t.Fatalf("error is not *APIError: %T", err)
	}
	if apiErr.Kind != KindBadRequest {
		t.Errorf("Kind=%q, want %q", apiErr.Kind, KindBadRequest)
	}
	if apiErr.IsRetryable() {
		t.Error("a malformed message sequence must not be retryable")
	}
	if f.lastInput != nil {
		t.Error("provider called Bedrock despite an invalid message sequence")
	}
}

func TestNewBedrock_RequiresRegionAndModel(t *testing.T) {
	tests := []struct {
		name    string
		cfg     Config
		wantErr string
	}{
		{"missing region", Config{Model: "m"}, "region is required"},
		{"missing model", Config{BedrockRegion: "eu-central-1"}, "model id is required"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			p, err := NewBedrock(t.Context(), tc.cfg)
			if err == nil {
				t.Fatalf("expected an error containing %q", tc.wantErr)
			}
			if !strings.Contains(err.Error(), tc.wantErr) {
				t.Errorf("error=%q, want it to contain %q", err.Error(), tc.wantErr)
			}
			// The nil-interface contract: a failed construction must yield a
			// genuinely nil Provider, not a typed nil in a non-nil interface.
			if p != nil {
				t.Errorf("NewBedrock returned a non-nil Provider (%v) alongside an error", p)
			}
		})
	}
}

// TestNewBedrock_MaxTokensDefaulting covers the constructor's defaulting rule.
// Anthropic rejects requests without max_tokens, so an unset or non-positive
// config value must be replaced rather than passed through as zero.
//
// LoadDefaultConfig resolves credentials lazily, so this runs without AWS
// credentials present.
func TestNewBedrock_MaxTokensDefaulting(t *testing.T) {
	tests := []struct {
		name string
		cfg  int
		want int
	}{
		{"unset falls back to default", 0, defaultBedrockMaxTokens},
		{"negative falls back to default", -1, defaultBedrockMaxTokens},
		{"explicit value is honoured", 512, 512},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			p, err := NewBedrock(t.Context(), Config{
				BedrockRegion: "eu-central-1",
				Model:         "eu.anthropic.claude-3-5-sonnet-20241022-v2:0",
				MaxTokens:     tc.cfg,
			})
			if err != nil {
				t.Fatalf("NewBedrock: %v", err)
			}

			bp, ok := p.(*bedrockProvider)
			if !ok {
				t.Fatalf("NewBedrock returned %T, want *bedrockProvider", p)
			}
			if bp.maxTokens != tc.want {
				t.Errorf("maxTokens=%d, want %d", bp.maxTokens, tc.want)
			}
		})
	}
}
