## ADDED Requirements

### Requirement: Semantic Enrichment of Evidence Candidates

The system SHALL, when a semantic provider (Memory) is configured, enrich evidence
candidates with suggested artifact links and duplicate detection. The semantic
provider SHALL NOT be the store of record; it returns candidates only, and extraction
SHALL degrade gracefully when the provider is unavailable.

#### Scenario: Suggest artifact links

- **WHEN** extraction runs with a semantic provider configured
- **THEN** candidates may include suggested links to related artifacts derived from semantic search

#### Scenario: Detect duplicate evidence

- **WHEN** an extracted candidate is semantically near existing evidence
- **THEN** the candidate is flagged as a possible duplicate for the reviewer

#### Scenario: Graceful degradation

- **WHEN** the semantic provider is unavailable or not configured
- **THEN** extraction still produces candidates without enrichment and does not fail
