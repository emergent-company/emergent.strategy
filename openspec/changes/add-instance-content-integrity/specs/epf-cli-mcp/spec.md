## ADDED Requirements

### Requirement: Content Integrity in Health Checks

The content readiness check SHALL report framework content found in an instance
using the same classes and rule vocabulary as strategy-server: canonical
reference, unmodified template, packaged default, template values and near
canonical. It SHALL compare normalised parsed content against the embedded
canonical manifest, so an instance created from an older canonical release is
recognised.

The result SHALL carry the integrity data in an additive field on the content
readiness result, so health, report and both MCP health handlers expose it
without separate wiring. The default exit code and the content readiness score
SHALL NOT change.

Unmodified canonical definitions SHALL be reported at INFO and aggregated, in
keeping with the requirement that canonical definitions do not dominate health
output. Unmodified READY, AIM or product value-model templates and template
values in authored artifacts SHALL be reported at WARNING.

An artifact listed under `adopted_canonical` in the anchor SHALL be treated as
authored.

#### Scenario: Health on an instance holding templates

- **WHEN** `epf-cli health` runs on an instance with unmodified READY, AIM and
  product value-model templates and 131 unmodified definitions
- **THEN** the templates are listed as warnings, naming the files
- **AND** the definitions appear as one aggregated info line per track
- **AND** the exit code is unchanged

#### Scenario: Agent is directed to act

- **WHEN** `epf_health_check` finds unmodified templates
- **THEN** the response includes a required next step naming them and saying to
  fill them in or remove them

#### Scenario: Older canonical release

- **WHEN** an instance holds definitions from an earlier canonical release
- **THEN** they are recognised as canonical reference or near canonical, not
  reported as authored

### Requirement: Strict Integrity Mode

The system SHALL offer an opt-in strict mode for health checks in which
`unmodified_template` and `template_values` findings count as errors and so fail
the exit code. Without the opt-in, integrity findings SHALL NOT affect the exit
code.

#### Scenario: Strict health in CI

- **WHEN** `epf-cli health --strict-integrity` runs on an instance holding an
  unmodified template
- **THEN** the command exits non-zero and names the file

### Requirement: Instance Init Can Omit Canonical Definitions

`epf init` and `epf_init_instance` SHALL accept an option that skips copying the
canonical definitions into the instance. The default SHALL remain unchanged.

The anchor SHALL record the choice as `canonical_definitions: installed` or
`omitted`. When it is `omitted`, `sync-canonical` SHALL NOT offer to re-add the
definitions and the missing-canonical diagnostics SHALL be suppressed.

#### Scenario: Init without definitions

- **WHEN** a user runs `epf init` with the option set
- **THEN** no definition files are written
- **AND** the anchor records `canonical_definitions: omitted`

#### Scenario: Health after deliberate omission

- **WHEN** health runs on an instance whose anchor says `omitted`
- **THEN** it does not report missing canonical definitions
- **AND** it does not suggest running `sync-canonical`

### Requirement: Placeholder Detection Matches Documented Patterns

The placeholder patterns SHALL detect `Your Organization Name`, `Product Name
Here`, `e.g.,` in value position, `20XX` and `[FILL`, in both the health check
and the `validate` template warnings, from one shared definition. Canonical
detection SHALL recognise dot-named value-model files such as
`strategy.value_model.yaml`.

#### Scenario: North star template value

- **WHEN** a north star contains `organization: "Your Organization Name"`
- **THEN** both `validate` and `health` report it as a placeholder

#### Scenario: Value model file name

- **WHEN** health inspects `strategy.value_model.yaml`
- **THEN** it is recognised as a canonical artifact
