# Extraction Verification Capability

## ADDED Requirements

### Requirement: Verification Cascade

The system SHALL verify extracted entities against source text using a 3-tier cascade that minimizes verification costs by using cheaper methods first and only escalating when necessary.

#### Scenario: Entity name matches source exactly

- **WHEN** an extracted entity name appears verbatim in the source text
- **THEN** Tier 1 (exact match) returns verified=true with confidence >= 0.95
- **AND** no further verification tiers are invoked

#### Scenario: Entity name matches source with minor variations

- **WHEN** an extracted entity name differs from source text by minor variations (case, punctuation, whitespace)
- **THEN** Tier 1 (fuzzy match) calculates Levenshtein similarity
- **AND** if similarity >= 0.95, returns verified=true

#### Scenario: Entity name fails exact match but passes NLI

- **WHEN** Tier 1 returns verified=false
- **AND** NLI service is available
- **THEN** Tier 2 (NLI) evaluates entailment between source text (premise) and entity claim (hypothesis)
- **AND** if entailment score >= 0.9, returns verified=true

#### Scenario: NLI returns uncertain score

- **WHEN** Tier 2 NLI returns entailment score in uncertainty range (0.4-0.6)
- **THEN** Tier 3 (LLM Judge) is invoked for final verification

#### Scenario: NLI service unavailable

- **WHEN** Tier 1 returns verified=false
- **AND** NLI service is unavailable or times out
- **THEN** system skips Tier 2 and proceeds directly to Tier 3 (LLM Judge)

### Requirement: Property-Level Verification

The system SHALL verify individual entity properties in addition to entity names, ensuring each property value is supported by the source text.

#### Scenario: Property value matches source

- **WHEN** an entity has a property with a specific value
- **AND** the source text contains evidence supporting "[Entity] has [Property] = [Value]"
- **THEN** property verification returns verified=true

#### Scenario: Multiple properties verified independently

- **WHEN** an entity has multiple properties
- **THEN** each property is verified independently
- **AND** overall entity confidence is the minimum of entity verification and all property verifications

#### Scenario: Property verification limit

- **WHEN** an entity has more than the configured maximum properties (default: 20)
- **THEN** only the first N properties are verified
- **AND** remaining properties are marked as unverified

### Requirement: NLI Service API

The NLI service SHALL provide a prediction endpoint that returns entailment, contradiction, and neutral scores for premise-hypothesis pairs.

#### Scenario: Successful NLI prediction

- **WHEN** a valid premise and hypothesis are submitted to POST /predict
- **THEN** the service returns JSON with entailment, contradiction, and neutral scores (0.0-1.0)
- **AND** response time is under 5 seconds for typical inputs

#### Scenario: Health check

- **WHEN** GET /health is called
- **THEN** the service returns status "healthy" if model is loaded
- **AND** returns status "unhealthy" if model loading failed

### Requirement: Verification Configuration

The system SHALL support configurable thresholds for all verification tiers, with sensible defaults.

#### Scenario: Default configuration applied

- **WHEN** no custom configuration is provided
- **THEN** verification uses default thresholds:
  - Exact match: 0.95
  - NLI entailment: 0.9
  - NLI uncertainty range: 0.4-0.6
  - LLM model: gemini-2.0-flash-lite

#### Scenario: Custom thresholds override defaults

- **WHEN** custom configuration is provided
- **THEN** specified thresholds override defaults
- **AND** unspecified thresholds use default values

### Requirement: Verification Results

The system SHALL return structured verification results that include tier used, confidence scores, and per-property verification status.

#### Scenario: Verification result structure

- **WHEN** an entity is verified
- **THEN** result includes:
  - Entity ID and name
  - Entity verified status (boolean)
  - Verification tier used (1, 2, or 3)
  - Entity confidence score (0.0-1.0)
  - Array of property verification results
  - Overall confidence (minimum of entity + properties)

#### Scenario: Unverifiable entity

- **WHEN** an entity fails all verification tiers
- **THEN** result includes verified=false
- **AND** confidence score reflects the highest score achieved across tiers
