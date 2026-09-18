## ADDED Requirements

### Requirement: Validation Verdict Envelope

Every MCP tool that renders a validation verdict SHALL return a shared,
machine-readable envelope as `structuredContent`, and SHALL publish a matching
`outputSchema` so the envelope is discoverable rather than folklore.

The envelope SHALL contain `ok`, `summary`, `counts` and `findings`. The
envelope SHALL be identical across every validation tool, so a consumer can
read `ok` and `findings` without knowing which tool it called.

Tools covered: `validate_artifact`, `validate_instance`,
`validate_relationships`, `validate_with_plan`, `check_content_readiness`.

`health_check` is explicitly NOT covered: it reports completeness, not a
verdict, and defining `ok` for it would require the server to choose a
threshold for "healthy".

#### Scenario: A validation tool reports a verdict

- **WHEN** any covered validation tool completes
- **THEN** the response carries `structuredContent` matching the tool's
  published `outputSchema`
- **AND** `ok` is `true` if and only if `counts.error` is zero
- **AND** `counts.checked` reports how many subjects were examined, so a
  consumer can distinguish "clean" from "nothing ran"
- **AND** the existing human-readable `content` is present and unchanged

#### Scenario: Finding problems is a successful call

- **WHEN** a validation tool finds any number of errors in its subject
- **THEN** `isError` is `false`
- **AND** the verdict is carried in `ok` and `findings`

`isError` SHALL mean the call could not be performed. It SHALL NOT be used to
signal that the subject is invalid, because that would remove a caller's
ability to ask "what is the validation state?" — a legitimate query for
dashboards, coverage reports and surveying agents.

#### Scenario: The call genuinely fails

- **WHEN** a validation tool cannot perform the check — the instance does not
  exist, the schema cannot be compiled, the caller lacks access
- **THEN** `isError` is `true`
- **AND** no verdict is reported, because none was reached

#### Scenario: A consumer applies its own threshold

- **WHEN** a consumer needs a policy other than "zero errors"
- **THEN** `findings` enumerates every problem individually with its severity
- **AND** the consumer computes its own verdict from them

Acceptability is policy and it varies. An instance with a tolerated backlog
returns `ok: false` on every call; a consumer that gated on `ok` alone would
block all work there permanently. The server SHALL own the shape of a verdict
and SHALL NOT own the threshold for acting on it. Tool descriptions SHALL
state this, so `ok` is not mistaken for a universally meaningful gate.

### Requirement: Structured Validation Findings

Validation findings SHALL carry structured fields — severity, subject key,
rule identifier, and location — derived from the validator's own structured
error, NOT by reformatting a rendered error message.

Each finding SHALL have a stable identity across runs for unchanged input, so
a consumer can baseline current findings and act only on new ones.

#### Scenario: A schema violation becomes a finding

- **WHEN** an artifact fails schema validation
- **THEN** each distinct violation becomes one finding
- **AND** the finding carries the failing keyword as `rule` and the location
  within the payload as `path`, both taken from the structured validation
  error rather than parsed out of its message text

#### Scenario: Findings are stable across runs

- **WHEN** the same unchanged input is validated twice
- **THEN** the findings have identical `(key, rule, path)` tuples both times

A prose message is not a stable identifier — it changes whenever the
validation library rewords its output, which would present to a baselining
consumer as a wave of phantom new findings.

#### Scenario: Existing string errors keep working

- **WHEN** structured findings are added to a validation result
- **THEN** the existing `errors` string list remains populated exactly as
  before
- **AND** existing readers of that field continue to work without change
