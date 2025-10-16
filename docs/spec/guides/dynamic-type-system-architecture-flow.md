# Dynamic Type System Architecture Flow

## Complete System Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         USER INTERACTIONS                                │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
        ▼                           ▼                           ▼
┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│   Install    │          │   Create     │          │   Upload     │
│   Template   │          │   Object     │          │  Document    │
│   Pack       │          │   Manually   │          │              │
└──────┬───────┘          └──────┬───────┘          └──────┬───────┘
       │                         │                         │
       │                         │                         │
┌──────▼─────────────────────────▼─────────────────────────▼───────┐
│                    PROJECT TYPE REGISTRY                          │
│                                                                   │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐                │
│  │ Template   │  │  Custom    │  │ Discovered │                │
│  │   Types    │  │   Types    │  │   Types    │                │
│  │            │  │            │  │            │                │
│  │ • Req...   │  │ • Check... │  │ • Secur... │                │
│  │ • Deci...  │  │ • Action.. │  │ • Deploy.. │                │
│  │ • Risk     │  │            │  │   (pending)│                │
│  └────────────┘  └────────────┘  └────────────┘                │
│                                                                   │
│  Each type has:                                                   │
│  • JSON Schema for validation                                    │
│  • UI Config (icons, colors, forms)                             │
│  • Extraction prompts (for AI)                                  │
│  • Relationship rules                                            │
└───────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
┌─────────────────────────────────┐   ┌─────────────────────────────────┐
│      MANUAL OBJECT CREATION     │   │     AUTOMATED INGESTION         │
├─────────────────────────────────┤   ├─────────────────────────────────┤
│                                 │   │                                 │
│ 1. User selects type            │   │ 1. Document uploaded            │
│ 2. Form generated from schema   │   │ 2. Extraction job created       │
│ 3. User fills properties        │   │ 3. Document chunked             │
│ 4. Schema validation            │   │ 4. AI extracts objects          │
│ 5. Object created               │   │    (per enabled type)           │
│ 6. Relationships added          │   │ 5. Entity linking               │
│                                 │   │ 6. Relationships inferred       │
│ Example:                        │   │ 7. Confidence scoring           │
│ ```                             │   │ 8. Objects created              │
│ Type: Requirement               │   │                                 │
│ Title: "Support SSO"            │   │ Example extracted:              │
│ Category: Functional            │   │ ```                             │
│ Priority: Must                  │   │ Type: Requirement               │
│ Rationale: "Enterprise need"    │   │ Title: "99.9% uptime"           │
│ ```                             │   │ Category: NFR                   │
│                                 │   │ Confidence: 0.87                │
│                                 │   │ Source: doc-123, chunk-45       │
│                                 │   │ ```                             │
└─────────────────────────────────┘   └─────────────────────────────────┘
                    │                               │
                    └───────────────┬───────────────┘
                                    ▼
┌───────────────────────────────────────────────────────────────────────┐
│                         GRAPH OBJECTS STORAGE                         │
│                                                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │  Object  │  │  Object  │  │  Object  │  │  Object  │           │
│  │  REQ-001 │──│  DEC-042 │  │  RISK-05 │──│  APP-103 │           │
│  │          │  │          │  │          │  │          │           │
│  │ Manual   │  │Extracted │  │Extracted │  │ Manual   │           │
│  │confidence│  │conf: 0.87│  │conf: 0.92│  │confidence│           │
│  │  = 1.0   │  │review: ✓ │  │review: - │  │  = 1.0   │           │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘           │
│       │             │              │             │                  │
│       └─────┬───────┴──────┬───────┘             │                  │
│             │              │                     │                  │
│          trace_to      address              depend_on               │
│             │              │                     │                  │
│       ┌─────▼──────┐  ┌────▼─────┐         ┌────▼─────┐           │
│       │  GOAL-010  │  │  WP-020  │         │  API-201 │           │
│       └────────────┘  └──────────┘         └──────────┘           │
│                                                                       │
│  All objects have:                                                    │
│  • type (from registry)                                              │
│  • properties (validated by schema)                                  │
│  • extraction_job_id (if auto-extracted)                            │
│  • extraction_confidence (0.0-1.0)                                  │
│  • needs_review flag                                                │
│  • provenance (source document/chunk)                               │
└───────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
┌─────────────────────────────────┐   ┌─────────────────────────────────┐
│      TYPE DISCOVERY ENGINE      │   │     REPROCESSING ENGINE         │
├─────────────────────────────────┤   ├─────────────────────────────────┤
│                                 │   │                                 │
│ Analyzes extracted objects      │   │ User accepts new type           │
│ looking for patterns:           │   │ "SecurityControl"               │
│                                 │   │                                 │
│ 1. Cluster similar objects      │   │ Trigger reprocessing:           │
│    (by embeddings + props)      │   │                                 │
│ 2. Infer common schema          │   │ 1. Load all documents           │
│ 3. Generate type name (AI)      │   │ 2. Re-extract with new type     │
│ 4. Check similarity to existing │   │ 3. Find existing matches        │
│ 5. Create suggestion            │   │ 4. Merge strategies:            │
│                                 │   │    • Convert generic→typed      │
│ Example discovered:             │   │    • Add properties             │
│ ```                             │   │    • Create relationships       │
│ Type: SecurityControl           │   │ 5. Create new versions          │
│ Confidence: 83%                 │   │                                 │
│ Instances: 12                   │   │ Result:                         │
│ Schema: {                       │   │ • 8 new SecurityControl objs    │
│   control_id: string,           │   │ • 3 existing objects enhanced   │
│   category: enum[...],          │   │ • All linked to sources         │
│   status: enum[...]             │   │ • Provenance maintained         │
│ }                               │   │ ```                             │
│ Action: [Review]                │   │                                 │
│ ```                             │   │                                 │
└─────────────────────────────────┘   └─────────────────────────────────┘
                    │                               │
                    └───────────────┬───────────────┘
                                    ▼
┌───────────────────────────────────────────────────────────────────────┐
│                        FEEDBACK LOOP                                  │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │ Users review extracted objects:                            │     │
│  │ • Correct types                                            │     │
│  │ • Fix properties                                           │     │
│  │ • Add missing relationships                                │     │
│  │                                                            │     │
│  │ System learns:                                             │     │
│  │ • Common correction patterns                               │     │
│  │ • Type usage preferences                                   │     │
│  │ • Relationship patterns                                    │     │
│  │ • Quality improvements                                     │     │
│  │                                                            │     │
│  │ Future extractions improve automatically                   │     │
│  └────────────────────────────────────────────────────────────┘     │
└───────────────────────────────────────────────────────────────────────┘


## Data Flow for Document Ingestion

┌─────────────┐
│  Document   │
│   Upload    │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────┐
│  Document Processing            │
│  • PDF → Text                   │
│  • Chunking (semantic)          │
│  • Embedding generation         │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  Extraction Job Created         │
│  • Load enabled types from      │
│    project registry             │
│  • Load extraction prompts      │
│  • Initialize job tracker       │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  For Each Chunk                 │
│  ┌────────────────────────────┐ │
│  │ For Each Enabled Type      │ │
│  │                            │ │
│  │ 1. Load type schema        │ │
│  │ 2. Build prompt with       │ │
│  │    schema + examples       │ │
│  │ 3. LLM extraction          │ │
│  │ 4. Validate against schema │ │
│  │ 5. Confidence scoring      │ │
│  │                            │ │
│  │ Output: Candidate objects  │ │
│  └────────────────────────────┘ │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  Entity Linking                 │
│                                 │
│  For each candidate:            │
│  • Semantic search for similar  │
│  • Title/property matching      │
│  • Embedding similarity         │
│                                 │
│  Decision:                      │
│  ┌─────────────────────────┐   │
│  │ Similar exists?         │   │
│  │  Yes → Merge            │   │
│  │  No  → Create new       │   │
│  └─────────────────────────┘   │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  Relationship Inference         │
│                                 │
│  Analyze extracted objects:     │
│  • Load relationship rules      │
│  • Find co-occurrences          │
│  • Identify patterns            │
│  • Validate against rules       │
│                                 │
│  Create relationships with      │
│  confidence scores              │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  Quality Checks                 │
│                                 │
│  • Schema completeness          │
│  • Confidence thresholds        │
│  • Relationship validity        │
│  • Duplicate detection          │
│                                 │
│  Flag for review if needed      │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  Pattern Analysis (Background)  │
│                                 │
│  • Collect extraction results   │
│  • Cluster unmatched patterns   │
│  • Infer schemas                │
│  • Create type suggestions      │
│                                 │
│  → Type Discovery Queue         │
└─────────────────────────────────┘


## Schema Evolution Flow

┌─────────────┐
│  Template   │  (v1.0.0 installed)
│  Installed  │
└──────┬──────┘
       │
       ▼
┌──────────────────────────────────┐
│  Documents Ingested              │
│  • 100 Requirements extracted    │
│  • 42 Decisions extracted        │
│  • 18 Risks extracted            │
└──────┬───────────────────────────┘
       │
       ▼
┌──────────────────────────────────┐
│  Discovery Engine Finds Pattern  │
│  • 12 instances of               │
│    "SecurityControl" pattern     │
│  • Confidence: 83%               │
│  • Similar to: Risk, Requirement │
└──────┬───────────────────────────┘
       │
       ▼
┌──────────────────────────────────┐
│  User Reviews Suggestion         │
│  ✓ Accepts "SecurityControl"     │
│  • Customizes schema             │
│  • Adds fields                   │
│  • Requests reprocessing         │
└──────┬───────────────────────────┘
       │
       ▼
┌──────────────────────────────────┐
│  New Type Added to Registry      │
│  • Schema version 1              │
│  • Source: discovered            │
│  • Status: enabled               │
└──────┬───────────────────────────┘
       │
       ▼
┌──────────────────────────────────┐
│  Reprocessing Job Triggered      │
│  • Scan previous documents       │
│  • Extract SecurityControl type  │
│  • Merge with existing objects   │
│  • Create new objects            │
└──────┬───────────────────────────┘
       │
       ▼
┌──────────────────────────────────┐
│  Results                         │
│  • 8 new SecurityControl objects │
│  • 3 Risk objects enhanced       │
│  • 2 Requirements linked         │
│                                  │
│  Type now available for:         │
│  • Manual creation               │
│  • Future extractions            │
│  • Filtering/search              │
└──────────────────────────────────┘


## Key Benefits Visualized

┌──────────────────────────────────────────────────────────┐
│                    WITHOUT THIS SYSTEM                   │
│                                                          │
│  Document → Generic Text → Manual Tagging               │
│                                                          │
│  Problems:                                              │
│  • No structure                                         │
│  • Manual effort                                        │
│  • Inconsistent                                         │
│  • No relationships                                     │
│  • No evolution                                         │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                     WITH THIS SYSTEM                     │
│                                                          │
│  Document → AI Extraction → Typed Objects → Graph       │
│                                                          │
│  Benefits:                                              │
│  ✓ Structured data                                      │
│  ✓ Automated extraction                                 │
│  ✓ Schema validation                                    │
│  ✓ Automatic relationships                              │
│  ✓ Type discovery                                       │
│  ✓ Continuous improvement                               │
│  ✓ Reprocessing capability                              │
│  ✓ Auditability                                         │
└──────────────────────────────────────────────────────────┘
```

## Summary

This architecture provides:

1. **Template-Based Foundation** - Start fast with TOGAF or other templates
2. **Manual Override** - Users can create/edit objects directly
3. **AI-Powered Ingestion** - Automatic extraction from documents
4. **Type Discovery** - System learns new patterns
5. **Evolution Support** - Reprocess with new types
6. **Full Provenance** - Track every object's origin
7. **Quality Control** - Confidence scoring and review workflow
8. **Relationship Intelligence** - Automatic linking between objects
9. **No Lock-In** - Custom types alongside templates
10. **Continuous Learning** - System improves with usage
