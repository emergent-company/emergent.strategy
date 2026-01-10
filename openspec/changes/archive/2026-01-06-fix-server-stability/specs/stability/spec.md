# Spec: Server Stability

## MODIFIED Requirements

### Requirement: Safe Semantic Chunking

The system MUST process semantic chunking in manageable batches to prevent Out-Of-Memory (OOM) errors.

#### Scenario: Large Document Processing

- **Given** a large document with thousands of sentences (e.g., >3000)
- **When** `chunkDocument` is called
- **Then** the system MUST split embedding generation into batches (e.g., 100 sentences)
- **And** process these batches sequentially or with limited concurrency
- **And** NOT crash the server

### Requirement: Auth Circuit Breaker

The system MUST back off from calling the Identity Provider (Zitadel) if it consistently returns internal errors (500).

#### Scenario: Upstream Failure

- **Given** Zitadel returns a 500 error for token acquisition
- **When** subsequent introspection calls are made
- **Then** the system MUST return `null` immediately without calling Zitadel for a cooldown period (e.g., 30s)
- **And** log a "Circuit open" warning once per period
