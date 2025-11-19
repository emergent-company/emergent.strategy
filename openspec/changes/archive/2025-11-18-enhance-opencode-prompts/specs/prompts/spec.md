# Prompts Specification

## ADDED Requirements

### Requirement: Proposal Creation Prompt

The prompt for creating proposals MUST be accessible via `os-proposal`.

#### Scenario: User invokes os-proposal

Given the user types `/os-proposal`
Then the agent should receive the instructions for scaffolding a new OpenSpec change.

### Requirement: Proposal Application Prompt

The prompt for applying proposals MUST be accessible via `os-apply`.

#### Scenario: User invokes os-apply

Given the user types `/os-apply`
Then the agent should receive the instructions for implementing an OpenSpec change.

### Requirement: Proposal Archival Prompt

The prompt for archiving proposals MUST be accessible via `os-archive`.

#### Scenario: User invokes os-archive

Given the user types `/os-archive`
Then the agent should receive the instructions for archiving an OpenSpec change.

### Requirement: Proposal Listing Prompt

A new prompt MUST be available to list existing proposals with details.

#### Scenario: User invokes os-list

Given the user types `/os-list`
Then the agent should run `openspec list` and `openspec list --specs`
And present the output to the user.
