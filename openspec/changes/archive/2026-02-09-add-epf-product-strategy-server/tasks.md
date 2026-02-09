# Tasks: Add Product Strategy Server to epf-cli

## 1. Core Infrastructure

### 1.1 Strategy Store Interface

- [x] 1.1.1 Define `StrategyStore` interface in `internal/strategy/store.go`
- [x] 1.1.2 Define core accessor methods (GetVision, GetPersonas, etc.)
- [x] 1.1.3 Define relationship query methods (GetPainPointsForPersona, etc.)
- [x] 1.1.4 Define search and context methods
- [x] 1.1.5 Define lifecycle methods (Reload, Close)
- [x] 1.1.6 Add unit tests for interface contracts

### 1.2 Strategy Model Types

- [x] 1.2.1 Create `internal/strategy/model.go` with core types:
  - Vision, Mission, NorthStar
  - Persona, PainPoint
  - ValueProposition
  - Competitor, CompetitiveAnalysis
  - Roadmap, OKR, KeyResult
- [x] 1.2.2 Create relationship indexes in model.go
- [x] 1.2.3 Create SearchResult type in model.go
- [x] 1.2.4 Create StrategicContext type in model.go
- [x] 1.2.5 Add unit tests for model types

## 2. FileSystem Source Implementation

### 2.1 Parser

- [x] 2.1.1 Create `internal/strategy/parser.go` with YAML parsing logic
- [x] 2.1.2 Implement North Star parsing (00_north_star.yaml)
- [x] 2.1.3 Implement Insight Analyses parsing (01_insight_analyses.yaml)
- [x] 2.1.4 Implement Strategy Foundations parsing (02_strategy_foundations.yaml)
- [x] 2.1.5 Implement Strategy Formula parsing (04_strategy_formula.yaml)
- [x] 2.1.6 Implement Roadmap Recipe parsing (05_roadmap_recipe.yaml)
- [x] 2.1.7 Implement Feature Definition parsing (fd-\*.yaml)
- [x] 2.1.8 Handle partial/incomplete EPF instances gracefully
- [x] 2.1.9 Add comprehensive unit tests for parser

### 2.2 FileSystemSource

- [x] 2.2.1 Create `internal/strategy/filesystem.go` implementing StrategyStore
- [x] 2.2.2 Implement instance discovery (find EPF root from path)
- [x] 2.2.3 Implement Load() method to parse all artifacts
- [x] 2.2.4 Build relationship indexes on load:
  - PersonaToPainPoints
  - PainPointToValueProps
  - FeatureToPersonas
- [x] 2.2.5 Handle concurrent read access with RWMutex
- [x] 2.2.6 Add unit tests with test fixtures
- [x] 2.2.7 Add integration tests with real EPF instance (docs/EPF/\_instances/emergent)

### 2.3 File Watcher

- [x] 2.3.1 Create `internal/strategy/watcher.go` using fsnotify
- [x] 2.3.2 Implement debounced file change detection (200ms)
- [x] 2.3.3 Implement selective reload (only affected artifacts)
- [x] 2.3.4 Add Watch() and StopWatching() methods
- [x] 2.3.5 Add unit tests for watcher behavior

## 3. Search Implementation

### 3.1 Full-Text Search

- [x] 3.1.1 Evaluate and select search library (custom implementation chosen)
- [x] 3.1.2 Create `internal/strategy/search.go`
- [x] 3.1.3 Implement index building from StrategyModel
- [x] 3.1.4 Implement Search() method with relevance scoring
- [x] 3.1.5 Implement snippet extraction for search results
- [x] 3.1.6 Add support for incremental index updates
- [x] 3.1.7 Add unit tests for search functionality

### 3.2 Context Synthesis

- [x] 3.2.1 Create context synthesis in `internal/strategy/filesystem.go`
- [x] 3.2.2 Implement topic-to-keyword extraction
- [x] 3.2.3 Implement relationship traversal for context gathering
- [x] 3.2.4 Implement context ranking and prioritization
- [x] 3.2.5 Add unit tests for context synthesis

## 4. MCP Tools

### 4.1 Core Query Tools

- [x] 4.1.1 Create `internal/mcp/strategy_tools.go`
- [x] 4.1.2 Implement `epf_get_product_vision` tool
- [x] 4.1.3 Implement `epf_get_personas` tool
- [x] 4.1.4 Implement `epf_get_persona_details` tool
- [x] 4.1.5 Implement `epf_get_value_propositions` tool
- [x] 4.1.6 Implement `epf_get_competitive_position` tool
- [x] 4.1.7 Implement `epf_get_roadmap_summary` tool
- [x] 4.1.8 Add unit tests for each tool

### 4.2 Search and Context Tools

- [x] 4.2.1 Implement `epf_search_strategy` tool
- [x] 4.2.2 Implement `epf_get_feature_strategy_context` tool
- [x] 4.2.3 Add unit tests for search and context tools

### 4.3 Tool Registration

- [x] 4.3.1 Register strategy tools in MCP server (internal/mcp/server.go)
- [x] 4.3.2 Ensure strategy store is lazily initialized
- [x] 4.3.3 Add integration tests for MCP tool invocation

## 5. CLI Commands

### 5.1 Strategy Subcommand

- [x] 5.1.1 Create `cmd/strategy.go` with strategy subcommand group
- [x] 5.1.2 Implement `epf strategy serve` command
  - [x] Add --watch flag for file watching
  - [x] Add instance path argument
- [x] 5.1.3 Implement `epf strategy status` command
  - [x] Show artifact counts
  - [x] Show load time
  - [x] Show warnings for missing artifacts
- [x] 5.1.4 Implement `epf strategy export` command
  - [x] Support --output flag for file output
  - [x] Generate readable markdown document
- [x] 5.1.5 Add unit tests for CLI commands

### 5.2 Lazy Loading

- [x] 5.2.1 Implement lazy loading of strategy store in cmd/strategy.go
- [x] 5.2.2 Verify existing commands (validate, fix, health) don't load strategy store
- [x] 5.2.3 Add performance tests to verify <300ms for non-strategy commands

## 6. Documentation

### 6.1 AGENTS.md Updates

- [x] 6.1.1 Add Strategy Server section to apps/epf-cli/AGENTS.md
- [x] 6.1.2 Document new MCP tools with examples
- [x] 6.1.3 Document CLI commands
- [x] 6.1.4 Add use case examples (CI/CD, production AI, etc.)

### 6.2 README Updates

- [x] 6.2.1 Update apps/epf-cli/README.md with strategy server overview
- [x] 6.2.2 Add quick start for strategy server usage

## 7. Testing & Verification

### 7.1 Unit Tests

- [x] 7.1.1 Ensure >80% coverage for new code
- [x] 7.1.2 Add benchmark tests for strategy store loading
- [x] 7.1.3 Add benchmark tests for search performance

### 7.2 Integration Tests

- [x] 7.2.1 Add integration tests using docs/EPF/\_instances/emergent
- [x] 7.2.2 Test MCP tools via actual MCP protocol
- [x] 7.2.3 Test file watcher with real file changes

### 7.3 Manual Testing

- [ ] 7.3.1 Test with Cursor MCP integration
- [ ] 7.3.2 Test with Claude Desktop MCP integration
- [ ] 7.3.3 Verify AI agent workflows (coding with context, PR review)

## 8. Future Preparation (Not This PR)

These tasks are documented for future phases but NOT part of this implementation:

- [ ] 8.1 GitHubSource implementation (fetch from remote repos)
- [ ] 8.2 Semantic search with embeddings
- [ ] 8.3 Multi-product aggregation
- [ ] 8.4 Extraction to standalone epf-server
- [ ] 8.5 Authentication for server deployment

## Dependencies

- **fsnotify** - File system notifications (already in Go ecosystem)
- **Bleve** (or equivalent) - Full-text search library (evaluate during 3.1.1)

## Estimated Effort

| Section                   | Effort         |
| ------------------------- | -------------- |
| 1. Core Infrastructure    | 2-3 days       |
| 2. FileSystem Source      | 3-4 days       |
| 3. Search Implementation  | 2-3 days       |
| 4. MCP Tools              | 2-3 days       |
| 5. CLI Commands           | 1-2 days       |
| 6. Documentation          | 1 day          |
| 7. Testing & Verification | 2-3 days       |
| **Total**                 | **~2-3 weeks** |
