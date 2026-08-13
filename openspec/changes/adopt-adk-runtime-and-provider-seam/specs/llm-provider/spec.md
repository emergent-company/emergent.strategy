# llm-provider

## ADDED Requirements

### Requirement: Pluggable LLM provider interface

The system SHALL expose a single `Provider` interface that abstracts one LLM
call (chat completion, formatted completion, connectivity ping, model name), so
that callers depend on the interface and never on a concrete wire format.

#### Scenario: Callers depend on the interface

- **WHEN** a domain service (skillexec, aim, ripple) performs an LLM call
- **THEN** it does so through the `Provider` interface
- **AND** swapping the concrete provider requires no change to the caller

#### Scenario: Existing OpenAI-compatible client is a provider

- **WHEN** the server runs in `api-key` or `vertex` auth mode
- **THEN** the existing OpenAI-compatible client serves as the `Provider`
- **AND** its behaviour is unchanged from before this change

### Requirement: Provider-agnostic classified errors

The system SHALL preserve the classified error contract (`APIError` with
`ErrorKind`, `IsRetryable`, `IsAccessDenied`, and an actionable remediation)
across all providers, so callers branch on error kind without parsing raw
provider payloads.

#### Scenario: Access-denied is uniform across providers

- **WHEN** any provider returns an auth/permission failure
- **THEN** the caller observes `KindAccessDenied` with `Retryable=false` and an
  actionable remediation message

#### Scenario: Rate limiting is retryable across providers

- **WHEN** any provider returns a throttling/rate-limit signal
- **THEN** the caller observes `KindRateLimited` with `Retryable=true`

### Requirement: Claude on AWS Bedrock provider

The system SHALL provide a provider that calls Anthropic Claude models via AWS
Bedrock using the Anthropic Messages wire format, selected by
`LLM_AUTH_MODE=bedrock`, so deployments requiring EU data residency can run
Claude in an EU AWS region.

#### Scenario: Bedrock mode selected by config

- **WHEN** `LLM_AUTH_MODE=bedrock`, `LLM_BEDROCK_REGION` and a Bedrock model id
  are configured
- **THEN** the server constructs the Bedrock provider and uses it for all
  LLM-backed features

#### Scenario: Messages wire format translation

- **WHEN** a caller sends `[]ChatMessage` with a system message and JSON format
  request
- **THEN** the provider translates them into an Anthropic Messages request
  (system extracted to top level, JSON enforced by instruction)
- **AND** parses the Anthropic `content` blocks and usage back into `ChatResult`

### Requirement: Refreshable AWS credentials via the SDK

The Bedrock provider SHALL authenticate using the AWS SDK default credential
chain (instance role / STS / SSO / environment) with SigV4 request signing, so
credentials refresh automatically and no static key is stored in config.

#### Scenario: Instance-role credentials

- **WHEN** the server runs on AWS infra with an attached instance role and no
  static AWS key in config
- **THEN** the Bedrock provider signs requests with SigV4 using credentials
  resolved and refreshed by the AWS SDK

### Requirement: Boot preflight and health probe per provider

The system SHALL perform a live `Ping` at boot and on `/health` for whichever
provider is configured, reporting a classified status without failing overall
health (LLM remains optional).

#### Scenario: Bedrock preflight

- **WHEN** the server boots in bedrock mode
- **THEN** it performs one live `Ping`, logging `preflight ok` or a classified
  error with remediation
- **AND** `/health` reports `llm: ok` or `degraded` without failing overall
  health
