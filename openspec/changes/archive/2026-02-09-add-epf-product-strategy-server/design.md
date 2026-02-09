# Design: Product Strategy Server

## Context

The epf-cli is a Go CLI that validates EPF artifacts and serves as an MCP server for AI agents working on EPF instances. Currently, all access to EPF content requires local filesystem access. This design extends epf-cli to serve product strategy content to AI agents regardless of their runtime environment.

### Stakeholders

- **AI Agents** - Primary consumers of strategy content (Cursor, Claude, GitHub Copilot, custom agents)
- **Developers** - Use local epf-cli for authoring and validation
- **CI/CD Systems** - Need strategy context for PR review and automated checks
- **Product Teams** - Non-developers who want AI assistance grounded in product strategy

### Constraints

- Must not slow down existing CLI commands
- Must work without external dependencies (no database, no mandatory API calls)
- Must support both local filesystem and future GitHub-based sources
- EPF instances are small (~50 files, ~100KB) - no need for complex indexing

## Goals / Non-Goals

### Goals

1. **Provide semantic access to EPF strategy** via MCP tools that return structured, queryable data
2. **Support multiple data sources** through a pluggable StrategySource interface
3. **Enable real-time updates** for local development via file watching
4. **Maintain CLI performance** through lazy loading of strategy features
5. **Prepare for future extraction** to a standalone server if needed

### Non-Goals

1. **Write operations** - Strategy server is read-only; authoring uses existing commands
2. **Vector embeddings** - Out of scope for Phase 1; full-text search is sufficient
3. **Multi-product aggregation** - Single product focus; multi-product is future work
4. **User authentication** - Local MCP server; auth is future work for server deployment
5. **Caching to disk** - In-memory only; fast enough without persistence

## Decisions

### Decision 1: StrategyStore Interface Abstraction

**What:** Define a `StrategyStore` interface that abstracts how EPF artifacts are loaded and queried.

**Why:** Enables future extraction to standalone server with different data sources without changing MCP tools.

```go
type StrategyStore interface {
    // Core accessors
    GetVision() (*Vision, error)
    GetMission() (*Mission, error)
    GetNorthStar() (*NorthStar, error)
    GetPersonas() ([]*Persona, error)
    GetPersona(id string) (*Persona, error)
    GetValuePropositions() ([]*ValueProposition, error)
    GetCompetitors() ([]*Competitor, error)
    GetRoadmap() (*Roadmap, error)

    // Relationship queries
    GetPainPointsForPersona(personaID string) ([]*PainPoint, error)
    GetValuePropsAddressing(painPointID string) ([]*ValueProposition, error)
    GetFeaturesForPersona(personaID string) ([]*Feature, error)
    GetRoadmapForPersona(personaID string) ([]*RoadmapItem, error)

    // Search
    Search(query string) ([]*SearchResult, error)

    // Context synthesis
    GetStrategicContext(topic string) (*StrategicContext, error)

    // Lifecycle
    Reload() error
    Close() error
}
```

**Alternatives considered:**

- Direct file reading in MCP tools - Rejected: Tight coupling, no reuse
- Generic repository pattern - Rejected: Over-engineering for this use case

### Decision 2: In-Memory Strategy Model

**What:** Parse EPF YAML files into typed Go structs and hold them in memory with relationship indexes.

**Why:** EPF instances are small enough that in-memory storage is fast, simple, and sufficient.

```go
type StrategyModel struct {
    // Core artifacts
    NorthStar          *NorthStar
    InsightAnalyses    *InsightAnalyses
    StrategyFoundations *StrategyFoundations
    StrategyFormula    *StrategyFormula
    RoadmapRecipe      *RoadmapRecipe

    // FIRE artifacts
    Features           map[string]*FeatureDefinition
    ValueModels        map[string]*ValueModel

    // Indexes for fast lookup
    PersonaIndex       map[string]*Persona
    PainPointIndex     map[string]*PainPoint
    FeatureIndex       map[string]*FeatureDefinition

    // Relationship graph
    PersonaToPainPoints    map[string][]string  // persona_id -> []pain_point_id
    PainPointToValueProps  map[string][]string  // pain_point_id -> []value_prop_id
    FeatureToPersonas      map[string][]string  // feature_id -> []persona_id
}
```

**Memory estimate for typical EPF instance:**

- Parsed artifacts: ~2-5MB
- Indexes: ~1-2MB
- Full-text index: ~1-2MB
- Total: ~5-10MB (negligible)

**Alternatives considered:**

- SQLite embedded database - Rejected: Adds dependency, not needed for this scale
- BadgerDB/BoltDB - Rejected: Persistence not needed, adds complexity

### Decision 3: FileSystemSource Implementation

**What:** Initial implementation reads from local filesystem with optional file watching.

```go
type FileSystemSource struct {
    basePath    string
    watcher     *fsnotify.Watcher
    model       *StrategyModel
    textIndex   *minisearch.Index
    mu          sync.RWMutex
}

func (s *FileSystemSource) Load() error {
    // 1. Discover EPF instance structure
    // 2. Parse all YAML files
    // 3. Build relationship indexes
    // 4. Build full-text search index
}

func (s *FileSystemSource) Watch() error {
    // Watch for file changes and rebuild affected parts
}
```

**Why filesystem first:**

- Most common use case (local development)
- No external dependencies
- Proven pattern in existing epf-cli

### Decision 4: Full-Text Search with MiniSearch

**What:** Use an in-memory full-text search library (MiniSearch or similar Go equivalent) for strategy search.

**Why:**

- No external dependencies
- Rebuilds instantly on file changes
- Covers most search use cases for structured content

```go
type SearchResult struct {
    ArtifactType  string   // "persona", "value_prop", "feature", etc.
    ArtifactID    string
    Title         string
    Snippet       string
    Score         float64
    MatchedFields []string
}
```

**Alternatives considered:**

- Bleve (Go full-text search) - Possible alternative, evaluate during implementation
- Vector embeddings - Deferred to Phase 2 if needed

### Decision 5: Lazy Loading for CLI Performance

**What:** Strategy server features only load when explicitly needed.

```go
// cmd/strategy.go
var strategyCmd = &cobra.Command{
    Use:   "strategy",
    Short: "Product strategy server commands",
    PersistentPreRunE: func(cmd *cobra.Command, args []string) error {
        // Only load strategy store when strategy commands are used
        return loadStrategyStore()
    },
}
```

**Why:**

- `epf validate` should stay fast (~200ms)
- `epf strategy serve` can take ~500ms to load
- Strategy features are optional for most CLI users

### Decision 6: MCP Tools for Strategy Queries

**What:** Add new MCP tools specifically for querying product strategy:

| Tool                           | Parameters         | Returns                                   |
| ------------------------------ | ------------------ | ----------------------------------------- |
| `epf_get_product_vision`       | none               | Vision, mission, purpose                  |
| `epf_get_personas`             | none               | List of personas with summaries           |
| `epf_get_persona_details`      | `persona_id`       | Full persona with pain points, narratives |
| `epf_get_value_propositions`   | `persona_id?`      | Value props, optionally filtered          |
| `epf_get_competitive_position` | `competitor?`      | Competitive analysis                      |
| `epf_get_roadmap_summary`      | `track?`, `cycle?` | Roadmap overview                          |
| `epf_search_strategy`          | `query`            | Search results across all artifacts       |
| `epf_get_strategic_context`    | `topic`            | Synthesized context for a topic           |

**Why separate from existing tools:**

- Existing tools are file-oriented (validate, fix, diff)
- Strategy tools are concept-oriented (personas, value props, roadmap)
- Clear separation of concerns

### Decision 7: Minimal CLI Commands

**What:** Only add CLI commands that serve diagnostic/operational purposes, not query duplication:

```bash
epf strategy serve      # Start long-running MCP server
epf strategy status     # Show what's loaded in strategy store
epf strategy export     # Export combined strategy document
```

**Why:**

- Humans can read EPF markdown files directly
- AI agents use MCP tools, not CLI
- Avoid maintaining two interfaces for the same data

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           epf-cli                                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────┐  ┌──────────────────────────────────────────────┐ │
│  │  Existing CLI    │  │           Strategy Server (New)              │ │
│  │                  │  │                                              │ │
│  │  - validate      │  │  ┌─────────────────────────────────────────┐ │ │
│  │  - fix           │  │  │         StrategyStore Interface         │ │ │
│  │  - health        │  │  │                                         │ │ │
│  │  - migrate       │  │  │  GetVision() GetPersonas() Search()     │ │ │
│  │  - ...           │  │  └─────────────────────────────────────────┘ │ │
│  │                  │  │                      │                       │ │
│  │                  │  │                      ▼                       │ │
│  │                  │  │  ┌─────────────────────────────────────────┐ │ │
│  │                  │  │  │        FileSystemSource                 │ │ │
│  │                  │  │  │                                         │ │ │
│  │                  │  │  │  ┌─────────────┐  ┌─────────────────┐   │ │ │
│  │                  │  │  │  │ YAML Parser │  │  File Watcher   │   │ │ │
│  │                  │  │  │  └─────────────┘  └─────────────────┘   │ │ │
│  │                  │  │  │         │                               │ │ │
│  │                  │  │  │         ▼                               │ │ │
│  │                  │  │  │  ┌─────────────────────────────────┐    │ │ │
│  │                  │  │  │  │      StrategyModel              │    │ │ │
│  │                  │  │  │  │                                 │    │ │ │
│  │                  │  │  │  │  - NorthStar, Personas, etc.    │    │ │ │
│  │                  │  │  │  │  - Relationship indexes         │    │ │ │
│  │                  │  │  │  │  - Full-text search index       │    │ │ │
│  │                  │  │  │  └─────────────────────────────────┘    │ │ │
│  │                  │  │  └─────────────────────────────────────────┘ │ │
│  │                  │  │                                              │ │
│  └──────────────────┘  └──────────────────────────────────────────────┘ │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                          MCP Server                                      │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Existing Tools (49)         │  Strategy Tools (8) - New         │   │
│  │                              │                                    │   │
│  │  epf_validate_file           │  epf_get_product_vision           │   │
│  │  epf_health_check            │  epf_get_personas                 │   │
│  │  epf_get_schema              │  epf_get_persona_details          │   │
│  │  epf_fix_file                │  epf_get_value_propositions       │   │
│  │  ...                         │  epf_get_competitive_position     │   │
│  │                              │  epf_get_roadmap_summary          │   │
│  │                              │  epf_search_strategy              │   │
│  │                              │  epf_get_strategic_context        │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

## Directory Structure (New Files)

```
apps/epf-cli/
├── cmd/
│   └── strategy.go              # New: strategy subcommand
├── internal/
│   ├── strategy/                # New: all strategy server code
│   │   ├── store.go             # StrategyStore interface
│   │   ├── model.go             # StrategyModel structs
│   │   ├── filesystem.go        # FileSystemSource implementation
│   │   ├── parser.go            # YAML to model parsing
│   │   ├── search.go            # Full-text search
│   │   ├── watcher.go           # File change watching
│   │   └── store_test.go        # Unit tests
│   └── mcp/
│       └── strategy_tools.go    # New: MCP tools for strategy queries
```

## Risks / Trade-offs

### Risk: Memory Usage for Large EPF Instances

**Risk:** Very large EPF instances might use significant memory.

**Mitigation:**

- Current EPF structure limits practical size (~50 files max)
- Monitor memory in tests with realistic data
- Add lazy loading of feature definitions if needed

### Risk: File Watcher Performance

**Risk:** Many rapid file changes could cause excessive rebuilding.

**Mitigation:**

- Debounce file change events (100-200ms)
- Rebuild only affected parts of the model, not entire store
- Document recommended usage patterns

### Risk: Search Quality Without Embeddings

**Risk:** Full-text search might not find conceptually related content.

**Mitigation:**

- EPF content is structured with known fields - exact search often sufficient
- Can add synonym expansion for common terms
- Phase 2 can add embeddings if full-text proves insufficient

### Trade-off: No Persistence

**Trade-off:** Strategy model rebuilds on every start.

**Accepted because:**

- Startup time is ~500ms, acceptable for long-running server
- No state sync issues between filesystem and cache
- Simpler implementation, fewer failure modes

## Migration Plan

No migration needed. This is purely additive functionality.

### Rollout

1. Implement core strategy store and model
2. Add FileSystemSource with parsing
3. Add MCP tools
4. Add file watching
5. Add CLI commands
6. Document usage patterns
7. Consider extraction to standalone server after real-world usage feedback

### Rollback

Remove strategy-related code. No database changes, no schema changes, no migration scripts.

## Open Questions

1. **Search library choice:** Should we use Bleve, or a simpler approach like regex matching on indexed fields?

   - _Recommendation:_ Start with Bleve for proper full-text search with stemming

2. **Relationship depth:** How deep should relationship traversal go? (e.g., persona -> pain points -> value props -> features)

   - _Recommendation:_ Implement 2-hop traversal initially, add deeper traversal if needed

3. **Context synthesis algorithm:** How should `epf_get_strategic_context` synthesize information?

   - _Recommendation:_ Start with keyword matching + relationship traversal; can improve with LLM if needed

4. **Error handling for partial EPF:** Should strategy server work with incomplete EPF instances?
   - _Recommendation:_ Yes, return available data with warnings about missing artifacts
