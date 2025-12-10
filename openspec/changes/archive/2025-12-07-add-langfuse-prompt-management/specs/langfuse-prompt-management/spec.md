# Langfuse Prompt Management

## ADDED Requirements

### Requirement: Prompt Fetching

The system SHALL provide a method to fetch prompts from Langfuse Prompt Management with caching.

#### Scenario: Fetch prompt successfully

- **WHEN** the system requests a prompt by name
- **AND** Langfuse is enabled and configured
- **AND** the prompt exists in Langfuse
- **THEN** the system SHALL return the prompt content
- **AND** the system SHALL cache the prompt for the configured TTL

#### Scenario: Fetch prompt with version

- **WHEN** the system requests a specific prompt version
- **THEN** the system SHALL return that exact version
- **AND** the system SHALL NOT return a different version

#### Scenario: Fetch prompt from cache

- **WHEN** the system requests a prompt that was recently fetched
- **AND** the cache TTL has not expired
- **THEN** the system SHALL return the cached prompt without making an API call

### Requirement: Prompt Fallback

The system SHALL fall back to hardcoded prompts when Langfuse prompts are unavailable.

#### Scenario: Fallback when Langfuse disabled

- **WHEN** Langfuse is disabled via configuration (`LANGFUSE_PROMPTS_ENABLED=false`)
- **AND** the system requests a prompt
- **THEN** the system SHALL return the hardcoded fallback prompt
- **AND** the system SHALL NOT attempt to contact Langfuse

#### Scenario: Fallback on API error

- **WHEN** Langfuse is enabled
- **AND** the Langfuse API returns an error
- **THEN** the system SHALL log a warning
- **AND** the system SHALL return the hardcoded fallback prompt
- **AND** extraction processing SHALL continue without interruption

#### Scenario: Fallback when prompt not found

- **WHEN** Langfuse is enabled
- **AND** the requested prompt does not exist in Langfuse
- **THEN** the system SHALL return the hardcoded fallback prompt

### Requirement: LangGraph Prompt Integration

The LangGraph extraction pipeline nodes SHALL fetch prompts from the prompt provider service.

#### Scenario: Entity extractor uses Langfuse prompt

- **WHEN** an extraction job runs the entity extractor node
- **AND** Langfuse prompts are enabled
- **THEN** the node SHALL request the entity extraction prompt from the prompt provider
- **AND** the node SHALL use the returned prompt for LLM calls

#### Scenario: All pipeline nodes use prompt provider

- **WHEN** an extraction job runs
- **THEN** the entity extractor node SHALL fetch its prompt from the prompt provider
- **AND** the relationship builder node SHALL fetch its prompt from the prompt provider

### Requirement: Trace-Prompt Linking

The system SHALL link fetched prompts to Langfuse trace observations for debugging.

#### Scenario: Prompt metadata in generation observation

- **WHEN** an LLM call is made using a Langfuse prompt
- **THEN** the generation observation SHALL include `promptName` metadata
- **AND** the generation observation SHALL include `promptVersion` metadata
- **AND** the generation observation SHALL include `promptSource` metadata (langfuse or fallback)

#### Scenario: Clickable prompt link in Langfuse UI

- **WHEN** viewing a trace in Langfuse UI
- **AND** the generation used a Langfuse-managed prompt
- **THEN** the prompt name and version SHALL be visible in the observation details
- **AND** the prompt SHALL be clickable to navigate to the prompt in prompt management

### Requirement: Prompt Seeding

The system SHALL provide a script to seed initial prompts in Langfuse from hardcoded prompts.

#### Scenario: Seed new prompts

- **WHEN** the seed script runs
- **AND** a prompt does not exist in Langfuse
- **THEN** the script SHALL create the prompt with the hardcoded content
- **AND** the script SHALL apply the `production` label
- **AND** the script SHALL include metadata (node type)

#### Scenario: Skip existing prompts

- **WHEN** the seed script runs
- **AND** a prompt already exists in Langfuse
- **THEN** the script SHALL skip creating that prompt
- **AND** the script SHALL log that the prompt was skipped
- **AND** the script SHALL NOT overwrite existing prompt content

### Requirement: Prompt Configuration

The system SHALL support configuration of prompt management behavior via environment variables.

#### Scenario: Enable/disable prompt management

- **WHEN** `LANGFUSE_PROMPTS_ENABLED` is set to `false`
- **THEN** the system SHALL NOT fetch prompts from Langfuse
- **AND** the system SHALL use hardcoded prompts for all operations

#### Scenario: Configure cache TTL

- **WHEN** `LANGFUSE_PROMPT_CACHE_TTL` is set to a number
- **THEN** the system SHALL cache prompts for that many seconds
- **AND** the system SHALL refetch prompts after the TTL expires
