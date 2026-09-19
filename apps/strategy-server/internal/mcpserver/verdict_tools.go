package mcpserver

// Verdict plumbing for the validation tools.
//
// Five tools render a judgement rather than returning data: validate_artifact,
// validate_instance, validate_relationships, validate_with_plan and
// check_content_readiness. Each publishes the same envelope through
// outputSchema and returns it as structuredContent, so a consumer can read
// `ok` and `findings` without knowing which tool it called.
//
// health_check is deliberately NOT in this set. It reports completeness and
// health, not a verdict; giving it an `ok` would require the server to define
// "healthy", which is the threshold the consumer owns.

import (
	"encoding/json"
	"fmt"

	"github.com/mark3labs/mcp-go/mcp"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/embedded"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/verdict"
)

// verdictSchemaCache lets the five tools share one reflection of the envelope
// type instead of recomputing an identical schema five times at startup.
var verdictSchemaCache = mcp.NewSchemaCache()

// withVerdictOutput declares the shared verdict envelope as a tool's output
// schema. Every validation tool uses this and none extends it: the envelope is
// only worth having if it is identical everywhere, and the moment one tool
// adds a field, consumers are back to needing per-tool knowledge.
//
// Tool-specific detail (validate_with_plan's fix plan, validate_instance's
// per-artifact breakdown) stays in the human-readable content.
func withVerdictOutput() mcp.ToolOption {
	return mcp.WithCachedOutputSchema[verdict.Verdict](verdictSchemaCache)
}

// verdictResult returns a verdict as structuredContent alongside the tool's
// existing human-readable body.
//
// detail is the tool's current response — unchanged, so this addition cannot
// break a consumer that reads text today, and so the MCP spec's advice to keep
// a textual representation is honoured.
//
// This never sets isError. Finding problems is a successful call: isError
// means the call could not be performed, and conflating the two would remove a
// caller's ability to ask "what is the validation state of this?" at all.
func verdictResult(v verdict.Verdict, detail any) (*mcp.CallToolResult, error) {
	b, err := json.Marshal(detail)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("marshal result: %v", err)), nil
	}
	return mcp.NewToolResultStructured(v, string(b)), nil
}

// findingsFromValidation converts one artifact's schema validation into
// findings, stamping the artifact key onto each.
//
// The findings are built in the validator from the structured schema error;
// this only attaches identity. artifactKey may be empty for validate_artifact,
// which judges a loose payload that has no key.
func findingsFromValidation(artifactKey string, r embedded.ValidationResult) []verdict.Finding {
	out := make([]verdict.Finding, 0, len(r.Findings))
	for _, f := range r.Findings {
		f.Key = artifactKey
		out = append(out, f)
	}
	return out
}

// readinessFindings converts a content-readiness report into findings.
//
// Every finding is a warning, never an error, so a readiness check always
// reports ok: true. That is deliberate. Readiness is a 0-100 score, and
// choosing which score is "failing" is a policy the consumer owns — the server
// stating it would be the exact overreach the envelope exists to avoid. A
// consumer that wants to gate on readiness reads counts.warning or findings
// and applies its own bar.
//
// The one exception is a payload that could not be parsed, which is an error:
// the check could not be performed at all.
func readinessFindings(r embedded.ReadinessReport) []verdict.Finding {
	out := make([]verdict.Finding, 0, len(r.Missing))
	for _, field := range r.Missing {
		if field == "payload could not be parsed as JSON" {
			out = append(out, verdict.Finding{
				Severity: verdict.SeverityError,
				Key:      r.ArtifactKey,
				Rule:     "readiness.unreadable",
				Message:  fmt.Sprintf("%s: payload could not be parsed as JSON", r.ArtifactKey),
			})
			continue
		}
		out = append(out, verdict.Finding{
			Severity: verdict.SeverityWarning,
			Key:      r.ArtifactKey,
			Rule:     "readiness.missing_field",
			Path:     "/" + field,
			Message: fmt.Sprintf("recommended field %q is empty or missing (readiness %d/100, %s)",
				field, r.Score, r.Level),
		})
	}
	return out
}
