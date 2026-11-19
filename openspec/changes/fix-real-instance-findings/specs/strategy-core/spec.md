## MODIFIED Requirements

### Requirement: OKR readers walk all OKR groups

Every OKR reader — `Objectives()`, `KeyResult()`, `extractKRTargets()`,
`objectivesView`, `keyResultView`, and `AlignPortfolio` — SHALL walk both
`tracks.*.okrs` and `tracks.*.future_okrs_*` groups. When Key Results are
found in `future_okrs_*` groups, the reader SHALL indicate which group they
belong to.

#### Scenario: Key Results in future_okrs_* are visible
- **WHEN** a roadmap has 9 Key Results under `okrs` and 43 under `future_okrs_q3_2026`
- **THEN** `get_view` with `view=objectives` returns all 52 Key Results
- **AND** `get_view` with `view=key_result` for a Key Result under `future_okrs_*` returns its content

#### Scenario: AlignPortfolio includes future_okrs_* targets
- **WHEN** a component is targeted only by a Key Result in `future_okrs_*`
- **THEN** `AlignPortfolio` marks it `active: true`, not dormant

### Requirement: AlignPortfolio dormant marking is transparent

When `AlignPortfolio` changes component activation, the change SHALL be
recorded with enough context to trace (which Key Results were considered, how
many were found, in which groups). `get_instance` or `health_check` SHOULD
report when an automatic classification was last applied.

#### Scenario: Alignment reports KR group counts
- **WHEN** `AlignPortfolio` runs on an instance with 9 KRs under `okrs` and 43 under `future_okrs_*`
- **THEN** the result includes the total KR count (52) and the breakdown by group
- **AND** `krs_with_targets` reflects all 52, not just the 9 under `okrs`

## ADDED Requirements

### Requirement: future_okrs_* schema validation

`future_okrs_*` groups in the roadmap schema SHALL be validated against the same
item schema as `okrs`, or SHALL be explicitly documented as free-form with no
validation.

#### Scenario: future_okrs_* validated like okrs
- **WHEN** a roadmap contains `future_okrs_q3_2026` with Key Results
- **THEN** each Key Result is validated against the same item schema as Key Results under `okrs`

### Requirement: KR id pattern allows suffixes

The Key Result id pattern SHALL allow suffixes beyond `^kr-[psoc]-\d{3}$`
(e.g. `kr-p-cyber-001`, `kr-p-ct-002`) to accommodate ids in production use.

#### Scenario: Extended KR id validates
- **WHEN** a Key Result has id `kr-p-cyber-001`
- **THEN** `validate_instance` does not report it as invalid

### Requirement: timeline in roadmap schema

The roadmap schema SHALL either include a `timeline` property (with
`cycle_start`, `cycle_end`, `key_milestones`, and optionally `next_cycle`) or
SHALL document where milestone dates belong.

#### Scenario: Timeline validates
- **WHEN** a roadmap includes `timeline.cycle_start`, `timeline.cycle_end` and `timeline.key_milestones`
- **THEN** `validate_instance` does not report them as unknown properties

### Requirement: Parked Key Result status

The roadmap schema SHALL either include `status` (with at least `active` and
`parked` values) and `parked_reason` on Key Result items, or SHALL document
the recommended alternative for expressing parked objectives.

#### Scenario: Parked Key Results are visible separately
- **WHEN** a Key Result has `status: parked` and `parked_reason: "deferred to Q4"`
- **THEN** `get_view` lists it apart from active Key Results with its reason
