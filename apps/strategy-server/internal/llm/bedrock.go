package llm

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/bedrockruntime"
	brtypes "github.com/aws/aws-sdk-go-v2/service/bedrockruntime/types"
	"github.com/aws/smithy-go"
)

// anthropicVersion is the Bedrock-specific Anthropic API version header value.
// Required in every Messages request body sent through Bedrock.
const anthropicVersion = "bedrock-2023-05-31"

// defaultBedrockMaxTokens bounds the response size. Anthropic requires
// max_tokens on every request (unlike OpenAI, where it is optional), so we must
// supply a default. Skill prompts routinely emit full artifact JSON, so this is
// deliberately generous.
const defaultBedrockMaxTokens = 8192

// jsonModeInstruction is appended to the system prompt when FormatJSON is
// requested. The Anthropic Messages API has no native `response_format`
// equivalent, so JSON output is enforced by instruction. Callers already
// validate and repair the payload (see skillexec's validation retry loop), so
// this is an enforcement hint rather than a hard guarantee.
const jsonModeInstruction = "\n\nYou must respond with a single valid JSON object and nothing else. " +
	"Do not wrap the JSON in markdown code fences. Do not add commentary before or after the JSON."

// bedrockInvoker is the narrow slice of the Bedrock runtime client this
// provider needs. Declaring it here keeps the wire translation and error
// mapping unit-testable without live AWS credentials.
type bedrockInvoker interface {
	InvokeModel(ctx context.Context, params *bedrockruntime.InvokeModelInput, optFns ...func(*bedrockruntime.Options)) (*bedrockruntime.InvokeModelOutput, error)
}

// bedrockProvider calls Anthropic Claude models through AWS Bedrock using the
// Anthropic Messages wire format.
//
// Authentication is delegated entirely to the AWS SDK's default credential
// chain (instance role / STS / SSO / environment), which owns SigV4 request
// signing and credential refresh. This is deliberately NOT routed through the
// oauth2.TokenSource Bearer seam used by the OpenAI-compatible client: Bedrock
// uses SigV4, not Bearer tokens, and forcing it through that seam would mean
// reimplementing credential refresh we get for free.
type bedrockProvider struct {
	client    bedrockInvoker
	model     string
	region    string
	maxTokens int
}

// NewBedrock constructs a Bedrock-backed Provider for the configured region and
// model. Credentials are resolved lazily by the AWS SDK default chain, so this
// succeeds without a live credential check — use Ping to verify reachability.
//
// Returns a genuinely nil Provider alongside an error when the AWS config
// cannot be loaded, so callers' `provider != nil` checks stay meaningful.
func NewBedrock(ctx context.Context, cfg Config) (Provider, error) {
	if cfg.BedrockRegion == "" {
		return nil, fmt.Errorf("bedrock: region is required (set LLM_BEDROCK_REGION)")
	}
	if cfg.Model == "" {
		return nil, fmt.Errorf("bedrock: model id is required (set LLM_MODEL)")
	}

	awsCfg, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(cfg.BedrockRegion))
	if err != nil {
		return nil, fmt.Errorf("bedrock: load AWS config: %w", err)
	}

	maxTokens := cfg.MaxTokens
	if maxTokens <= 0 {
		maxTokens = defaultBedrockMaxTokens
	}

	return &bedrockProvider{
		client:    bedrockruntime.NewFromConfig(awsCfg),
		model:     cfg.Model,
		region:    cfg.BedrockRegion,
		maxTokens: maxTokens,
	}, nil
}

// Model returns the configured Bedrock model id.
func (p *bedrockProvider) Model() string { return p.model }

// Chat sends a chat completion request and returns the response.
func (p *bedrockProvider) Chat(ctx context.Context, messages []ChatMessage, temperature float64) (*ChatResult, error) {
	return p.ChatWithFormat(ctx, messages, temperature, nil)
}

// ChatWithFormat sends a chat completion request, optionally requesting JSON
// output. Anthropic has no native structured-output flag, so FormatJSON is
// enforced via a system-prompt instruction.
func (p *bedrockProvider) ChatWithFormat(ctx context.Context, messages []ChatMessage, temperature float64, format *ResponseFormat) (*ChatResult, error) {
	return p.invoke(ctx, messages, temperature, format, p.maxTokens)
}

// Ping performs a minimal live generation to verify the provider is reachable,
// the credentials are accepted, and the model id is valid.
func (p *bedrockProvider) Ping(ctx context.Context) error {
	_, err := p.invoke(ctx, []ChatMessage{{Role: "user", Content: "ping"}}, 0, nil, 1)
	return err
}

// anthropicRequest is the Anthropic Messages request body as accepted by
// Bedrock's InvokeModel.
type anthropicRequest struct {
	AnthropicVersion string             `json:"anthropic_version"`
	MaxTokens        int                `json:"max_tokens"`
	System           string             `json:"system,omitempty"`
	Messages         []anthropicMessage `json:"messages"`
	Temperature      float64            `json:"temperature,omitempty"`
}

type anthropicMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// anthropicResponse is the Anthropic Messages response body.
type anthropicResponse struct {
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	StopReason string `json:"stop_reason"`
	Usage      struct {
		InputTokens  int `json:"input_tokens"`
		OutputTokens int `json:"output_tokens"`
	} `json:"usage"`
}

func (p *bedrockProvider) invoke(ctx context.Context, messages []ChatMessage, temperature float64, format *ResponseFormat, maxTokens int) (*ChatResult, error) {
	system, msgs, err := translateMessages(messages)
	if err != nil {
		return nil, &APIError{
			Kind:       KindBadRequest,
			StatusCode: 400,
			Provider:   p.providerHost(),
			Model:      p.model,
			Message:    err.Error(),
			Action:     "Fix the message sequence before calling the provider; this is a code bug.",
			Retryable:  false,
		}
	}

	if format != nil && format.Type == "json_object" {
		system += jsonModeInstruction
	}

	body, err := json.Marshal(anthropicRequest{
		AnthropicVersion: anthropicVersion,
		MaxTokens:        maxTokens,
		System:           system,
		Messages:         msgs,
		Temperature:      temperature,
	})
	if err != nil {
		return nil, fmt.Errorf("bedrock: marshal request: %w", err)
	}

	out, err := p.client.InvokeModel(ctx, &bedrockruntime.InvokeModelInput{
		ModelId:     aws.String(p.model),
		Body:        body,
		ContentType: aws.String("application/json"),
		Accept:      aws.String("application/json"),
	})
	if err != nil {
		return nil, p.classifyBedrockError(err)
	}

	var resp anthropicResponse
	if err := json.Unmarshal(out.Body, &resp); err != nil {
		return nil, fmt.Errorf("bedrock: unmarshal response: %w", err)
	}

	return &ChatResult{
		Content:      joinTextBlocks(resp.Content),
		InputTokens:  resp.Usage.InputTokens,
		OutputTokens: resp.Usage.OutputTokens,
	}, nil
}

// joinTextBlocks concatenates the text of all text-type content blocks.
// Anthropic returns content as an array of typed blocks; non-text blocks
// (e.g. tool_use) carry no prose and are skipped.
func joinTextBlocks(blocks []struct {
	Type string `json:"type"`
	Text string `json:"text"`
}) string {
	var b strings.Builder
	for _, blk := range blocks {
		if blk.Type == "text" || blk.Type == "" {
			b.WriteString(blk.Text)
		}
	}
	return b.String()
}

// translateMessages converts the provider-neutral []ChatMessage into the
// Anthropic shape: system prompts are hoisted to a top-level field, and the
// remaining messages must form a non-empty, strictly alternating sequence that
// begins with "user".
//
// Consecutive same-role messages are merged rather than rejected — callers
// legitimately build multi-part prompts, and Anthropic would otherwise 400.
func translateMessages(messages []ChatMessage) (system string, out []anthropicMessage, err error) {
	var systemParts []string

	for _, m := range messages {
		switch m.Role {
		case "system":
			if m.Content != "" {
				systemParts = append(systemParts, m.Content)
			}
		case "user", "assistant":
			// Merge with the previous message when the role repeats: Anthropic
			// requires strict user/assistant alternation.
			if n := len(out); n > 0 && out[n-1].Role == m.Role {
				out[n-1].Content += "\n\n" + m.Content
				continue
			}
			// Field-identical to ChatMessage (only JSON tags differ), so a
			// direct conversion is safe — and will fail to compile if the two
			// shapes ever diverge, forcing a conscious decision here.
			out = append(out, anthropicMessage(m))
		default:
			return "", nil, fmt.Errorf("unsupported message role %q", m.Role)
		}
	}

	if len(out) == 0 {
		return "", nil, errors.New("no user or assistant messages: Anthropic requires at least one")
	}
	if out[0].Role != "user" {
		return "", nil, fmt.Errorf("first non-system message must be from user, got %q", out[0].Role)
	}

	return strings.Join(systemParts, "\n\n"), out, nil
}

// providerHost renders the Bedrock regional endpoint for error messages.
func (p *bedrockProvider) providerHost() string {
	return fmt.Sprintf("bedrock-runtime.%s.amazonaws.com", p.region)
}

// classifyBedrockError maps AWS SDK typed errors onto the shared ErrorKind
// taxonomy so callers branch identically regardless of provider. The Action
// strings stay actionable and Bedrock-specific.
func (p *bedrockProvider) classifyBedrockError(err error) error {
	e := &APIError{
		Provider: p.providerHost(),
		Model:    p.model,
		Message:  err.Error(),
		RawBody:  truncate(err.Error(), 800),
	}

	var (
		accessDenied  *brtypes.AccessDeniedException
		throttling    *brtypes.ThrottlingException
		quotaExceeded *brtypes.ServiceQuotaExceededException
		validation    *brtypes.ValidationException
		notFound      *brtypes.ResourceNotFoundException
		notReady      *brtypes.ModelNotReadyException
		timeout       *brtypes.ModelTimeoutException
		unavailable   *brtypes.ServiceUnavailableException
		internal      *brtypes.InternalServerException
		modelErr      *brtypes.ModelErrorException
	)

	switch {
	case errors.As(err, &accessDenied):
		e.Kind = KindAccessDenied
		e.StatusCode = 403
		e.Retryable = false
		e.Message = derefMsg(accessDenied.Message, e.Message)
		e.Action = fmt.Sprintf("Verify the AWS principal can invoke Bedrock in %s: it needs bedrock:InvokeModel on model %q, "+
			"and the model must be enabled for the account in the Bedrock console (Model access). "+
			"Also confirm credentials are present (instance role / STS / SSO / env). Not retryable.", p.region, p.model)

	case errors.As(err, &throttling):
		e.Kind = KindRateLimited
		e.StatusCode = 429
		e.Retryable = true
		e.Message = derefMsg(throttling.Message, e.Message)
		e.Action = "Back off and retry; if persistent, request a Bedrock quota increase for this model and region."

	case errors.As(err, &quotaExceeded):
		e.Kind = KindRateLimited
		e.StatusCode = 429
		e.Retryable = true
		e.Message = derefMsg(quotaExceeded.Message, e.Message)
		e.Action = "Bedrock service quota exceeded; back off and retry, or request a quota increase."

	case errors.As(err, &notFound):
		e.Kind = KindModelNotFound
		e.StatusCode = 404
		e.Retryable = false
		e.Message = derefMsg(notFound.Message, e.Message)
		e.Action = fmt.Sprintf("Check that LLM_MODEL (%q) is a valid Bedrock model id or inference profile available in %s. "+
			"Cross-region profiles are prefixed by geography (e.g. \"eu.anthropic.claude-...\").", p.model, p.region)

	case errors.As(err, &validation):
		e.Kind = KindBadRequest
		e.StatusCode = 400
		e.Retryable = false
		e.Message = derefMsg(validation.Message, e.Message)
		e.Action = "Bedrock rejected the request as malformed; this is a configuration or code issue."

	case errors.As(err, &notReady):
		e.Kind = KindServerError
		e.StatusCode = 503
		e.Retryable = true
		e.Message = derefMsg(notReady.Message, e.Message)
		e.Action = "The model is still warming up; retry after a short delay."

	case errors.As(err, &timeout):
		e.Kind = KindServerError
		e.StatusCode = 504
		e.Retryable = true
		e.Message = derefMsg(timeout.Message, e.Message)
		e.Action = "The model timed out; retry, and consider a smaller prompt if it persists."

	case errors.As(err, &unavailable):
		e.Kind = KindServerError
		e.StatusCode = 503
		e.Retryable = true
		e.Message = derefMsg(unavailable.Message, e.Message)
		e.Action = "Transient Bedrock outage; retry after a short delay."

	case errors.As(err, &internal):
		e.Kind = KindServerError
		e.StatusCode = 500
		e.Retryable = true
		e.Message = derefMsg(internal.Message, e.Message)
		e.Action = "Transient Bedrock error; retry after a short delay."

	case errors.As(err, &modelErr):
		e.Kind = KindServerError
		e.StatusCode = 424
		e.Retryable = true
		e.Message = derefMsg(modelErr.Message, e.Message)
		e.Action = "The model returned an error for this input; retry, and inspect the prompt if it persists."

	case isCredentialsError(err):
		// The request never reached AWS — the SDK could not resolve or refresh
		// credentials. This is the Bedrock analogue of a 403 and, like it,
		// needs a human to fix the environment rather than a retry.
		e.Kind = KindAccessDenied
		e.StatusCode = 401
		e.Retryable = false
		e.Action = fmt.Sprintf("The AWS SDK could not resolve credentials for region %s, so the request never reached Bedrock. "+
			"Provide credentials via one of: an attached instance role / IRSA, AWS_PROFILE with a valid SSO or STS session "+
			"(`aws sso login`), or AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY. Not retryable.", p.region)

	default:
		// Surface an AWS API error code when one is present: this catches
		// service errors that are not in the typed Bedrock exception set.
		var apiErr smithy.APIError
		if errors.As(err, &apiErr) {
			e.Message = apiErr.ErrorMessage()
			e.Action = fmt.Sprintf("Bedrock returned error code %q. Check the Bedrock documentation for this code, "+
				"and verify the model id and region.", apiErr.ErrorCode())
		} else {
			e.Action = fmt.Sprintf("The call to Bedrock failed before a service response was received. "+
				"Check network reachability to %s and that the region is correct.", p.providerHost())
		}
		e.Kind = KindUnknown
		e.Retryable = false
	}

	return e
}

// credentialFailureMarkers are the stable substrings the AWS SDK emits when
// credential resolution or refresh fails. There is no exported error type for
// this case, so detection is necessarily a heuristic — it runs only after every
// typed check has been tried, and a false negative merely downgrades the error
// to KindUnknown rather than misreporting it.
var credentialFailureMarkers = []string{
	"get credentials",
	"failed to refresh cached credentials",
	"no EC2 IMDS role found",
	"failed to retrieve credentials",
}

// isCredentialsError reports whether err represents a failure to resolve or
// refresh AWS credentials (as opposed to an error returned by Bedrock itself).
//
// A credentials failure never produces a smithy.APIError, because the request
// is abandoned before it is signed and sent. That structural fact is the
// primary discriminator; the message markers then confirm the cause.
func isCredentialsError(err error) bool {
	var apiErr smithy.APIError
	if errors.As(err, &apiErr) {
		return false // AWS answered, so credentials were resolved.
	}
	msg := strings.ToLower(err.Error())
	for _, marker := range credentialFailureMarkers {
		if strings.Contains(msg, marker) {
			return true
		}
	}
	return false
}

// derefMsg returns the pointed-to string when non-empty, else the fallback.
// AWS SDK exception messages are *string and may be nil.
func derefMsg(p *string, fallback string) string {
	if p != nil && *p != "" {
		return *p
	}
	return fallback
}
