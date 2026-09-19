// Package verdict is the shared envelope a tool returns when it judges
// something rather than returning data about it.
//
// # Why this exists
//
// A query answers "what is the state of X" and its caller wants the answer
// whatever it is. An assertion answers "is X acceptable" and a caller may need
// to stop on the answer. MCP's isError covers neither — it means the call
// could not be performed — so a tool that set isError on an unwelcome finding
// would take away a caller's ability to ask the question at all.
//
// Tools therefore report a verdict in structuredContent, declared through
// outputSchema, and reserve isError for genuine call failure.
//
// # The names here are a cross-repo contract
//
// `ok`, `summary`, and `findings[].{severity,key,rule,message}` are consumed
// by opencode-harness (internal/provider/verdict.go) and requested of the
// other servers in the estate (emergent.strategy#53, emergent.memory#586).
// Do not rename them. Fields may be added — consumers unmarshal into a struct
// and ignore what they do not know — but the four above must keep their
// names and types.
//
// # Division of responsibility
//
// The server owns the SHAPE of a verdict. The consumer owns the THRESHOLD for
// acting on it. That is why Findings is enumerable rather than merely counted:
// acceptability is policy and varies by caller. A consumer adopting a gate on
// a corpus that predates it needs to baseline the existing findings and fail
// only on new ones, which is impossible against a count.
package verdict

import "fmt"

// Severity classifies one finding.
type Severity string

const (
	// SeverityError is a finding the tool considers disqualifying. Only this
	// severity affects OK.
	SeverityError Severity = "error"
	// SeverityWarning is worth reporting but does not, on its own, make the
	// subject unacceptable.
	SeverityWarning Severity = "warning"
	// SeverityInfo is context.
	SeverityInfo Severity = "info"
)

// Finding is one thing a tool objected to.
type Finding struct {
	// Severity is always set. Never leave it empty: a known consumer treats
	// an absent severity as blocking, so an unset warning silently becomes a
	// build-breaker. New normalises this, but set it at the source anyway.
	Severity Severity `json:"severity"`

	// Key identifies the subject — typically an artifact key such as
	// "fd-001". Empty when the tool validates a payload with no identity of
	// its own.
	Key string `json:"key,omitempty"`

	// Rule is a stable identifier for what was violated, namespaced by
	// producer: "schema.required", "relationship.broken_target",
	// "readiness.missing_field".
	//
	// This is a public contract. Consumers baseline on (Key, Rule, Path) to
	// distinguish pre-existing findings from new ones, so renaming a rule id
	// breaks them just as surely as removing a field would.
	Rule string `json:"rule"`

	// Path locates the problem within the subject, as a JSON pointer where
	// one applies.
	Path string `json:"path,omitempty"`

	// Message must stand alone. Consumers render findings as "key: message"
	// with nothing else alongside, so a message that only makes sense next to
	// Path will read as noise where it matters most.
	Message string `json:"message"`
}

// Counts summarises findings by severity.
type Counts struct {
	Error   int `json:"error"`
	Warning int `json:"warning"`
	Info    int `json:"info"`

	// Checked is how many subjects were examined.
	//
	// Not redundant with the other counts: zero errors means something very
	// different when 185 artifacts were checked than when none were. Without
	// it a consumer cannot tell "clean" from "nothing ran", and a gate that
	// cannot tell those apart passes when its input silently disappears.
	Checked int `json:"checked"`
}

// Verdict is a tool's judgement about its subject.
type Verdict struct {
	OK       bool      `json:"ok"`
	Summary  string    `json:"summary"`
	Counts   Counts    `json:"counts"`
	Findings []Finding `json:"findings"`
}

// New builds a verdict from the findings a tool produced.
//
// OK is (no error-severity findings). Warnings and info never affect it —
// that is the narrowest definition that does not embed a policy the server has
// no business holding.
//
// Note what this means in practice: on an instance with a tolerated backlog of
// invalid artifacts, OK is permanently false and carries no signal. It is the
// answer for the simple case, not the real one. Tool descriptions say so, and
// consumers with a real threshold should read Findings.
func New(checked int, findings []Finding) Verdict {
	if findings == nil {
		findings = []Finding{}
	}

	counts := Counts{Checked: checked}
	for i := range findings {
		// Normalise before counting so an unset severity cannot slip through
		// as a zero value and be read as blocking by a downstream consumer
		// without anyone having decided that.
		if findings[i].Severity == "" {
			findings[i].Severity = SeverityError
		}
		switch findings[i].Severity {
		case SeverityError:
			counts.Error++
		case SeverityWarning:
			counts.Warning++
		case SeverityInfo:
			counts.Info++
		}
	}

	return Verdict{
		OK:       counts.Error == 0,
		Summary:  defaultSummary(counts),
		Counts:   counts,
		Findings: findings,
	}
}

// WithSummary replaces the generated summary with a tool-specific one.
func (v Verdict) WithSummary(format string, args ...any) Verdict {
	v.Summary = fmt.Sprintf(format, args...)
	return v
}

func defaultSummary(c Counts) string {
	if c.Error == 0 && c.Warning == 0 && c.Info == 0 {
		if c.Checked == 0 {
			// Worth saying out loud rather than reporting a clean pass.
			return "nothing was checked"
		}
		return fmt.Sprintf("%s passed", plural(c.Checked, "check", "checks"))
	}

	out := fmt.Sprintf("%d error", c.Error)
	if c.Error != 1 {
		out += "s"
	}
	if c.Warning > 0 {
		out += fmt.Sprintf(", %d warning", c.Warning)
		if c.Warning != 1 {
			out += "s"
		}
	}
	if c.Info > 0 {
		out += fmt.Sprintf(", %d info", c.Info)
	}
	return out + fmt.Sprintf(" across %s", plural(c.Checked, "check", "checks"))
}

func plural(n int, one, many string) string {
	if n == 1 {
		return fmt.Sprintf("%d %s", n, one)
	}
	return fmt.Sprintf("%d %s", n, many)
}
