# Dynamic TOGAF-like Object Management System - Summary

## What We've Designed

A comprehensive system that combines **structured templates** (like TOGAF), **AI-powered extraction**, **automatic type discovery**, and **continuous evolution** for managing enterprise architecture artifacts.

## Key Documents Created

1. **`docs/spec/24-dynamic-type-discovery-and-ingestion.md`** - Complete technical specification
2. **`reference/togaf-core-template-pack.json`** - Example TOGAF template with 8 core types
3. **`docs/spec/guides/togaf-template-quickstart.md`** - User-facing workflow guide
4. **`docs/spec/guides/dynamic-type-system-architecture-flow.md`** - Visual architecture diagrams

## Core Capabilities

### 1. Template Pack System
- **Install pre-built templates** (TOGAF, Agile, Custom)
- **Project-level customization** (enable/disable types, adjust schemas)
- **Versioned packs** with signature verification
- **Multi-pack support** (combine templates)

**Example TOGAF Types Provided:**
- Capability (business architecture)
- Requirement (functional, NFR, constraints, compliance)
- Decision (ADR - Architecture Decision Records)
- ApplicationComponent (applications/systems)
- DataEntity (data models)
- Interface (APIs)
- Risk (risk management)
- WorkPackage (implementation planning)

### 2. Manual Object Creation
- **Schema-driven forms** auto-generated from JSON schemas
- **Type-aware validation** enforces data quality
- **Relationship management** with type constraints
- **Rich UI configs** (icons, colors, layouts per type)

### 3. Smart Document Ingestion
```
Document Upload → Chunking → Type-Aware Extraction → Entity Linking → 
  Relationship Inference → Confidence Scoring → Review Queue
```

**Per enabled type:**
- Custom AI prompts for extraction
- Few-shot examples for accuracy
- Schema validation of extracted data
- Confidence scoring (0.0-1.0)
- Automatic flagging for human review

**Entity Linking:**
- Finds similar existing objects
- Merge strategies (replace, merge, version)
- Prevents duplicates
- Maintains provenance

### 4. Automatic Type Discovery

**How it works:**
1. System analyzes extracted objects looking for **patterns**
2. Clusters similar untyped entities (embeddings + property similarity)
3. Infers JSON schema from clustered instances
4. Generates descriptive type name using AI
5. Creates **type suggestion** with confidence score
6. User reviews and can:
   - Accept as-is
   - Customize schema
   - Merge with existing type
   - Reject

**Example:**
```
Pattern Found: 12 instances of "SecurityControl"
Inferred Schema:
  - control_id: string
  - category: enum [authentication, authorization, encryption]
  - status: enum [planned, implemented, verified]
  - owner: string
  
Confidence: 83%
Action: [Review Suggestion]
```

### 5. Reprocessing Framework

**After accepting new type:**
```
Trigger Reprocessing → Scan documents → Extract new type → 
  Entity linking → Merge/Create → Update relationships → 
  Track provenance
```

**Merge Strategies:**
- **Replace**: New version supersedes old
- **Merge**: Intelligently combine properties (additive)
- **Version**: Create parallel version chains

**Provenance Maintained:**
- Link to original extraction job
- Track manual edits separately
- Support "what-if" preview before actual reprocessing

## Data Model (Key Tables)

```sql
-- Template management
kb.graph_template_packs           -- Available templates
kb.project_template_packs          -- Project installations
kb.project_object_type_registry    -- Per-project type catalog

-- Ingestion tracking
kb.object_extraction_jobs          -- Job queue and history
kb.graph_objects                   -- Objects with extraction metadata
  + extraction_job_id
  + extraction_confidence
  + needs_review

-- Type discovery
kb.object_type_suggestions         -- AI-suggested new types
  + inferred_schema
  + example_instances
  + confidence
  + review status
```

## Workflows

### Workflow 1: Start New Project with TOGAF
```
1. Create project
2. Install TOGAF Core template (30 seconds)
3. Customize: enable only needed types (Requirements, Decisions, Apps)
4. Upload requirements document
5. Trigger extraction job
6. Review extracted objects (filter: needs_review=true)
7. Approve or edit
8. Browse relationship graph
```

### Workflow 2: Discover Custom Type
```
1. System ingests 10+ documents
2. Notices 12 instances of "SecurityControl" pattern
3. Creates type suggestion with 83% confidence
4. User reviews suggestion dashboard
5. User accepts + customizes schema (adds fields)
6. System triggers reprocessing
7. 8 new SecurityControl objects created
8. 3 existing Risk objects enhanced
9. Type now available for manual creation + future extraction
```

### Workflow 3: Evolve Over Time
```
1. Start: TOGAF template with 8 types
2. Month 1: Discover "DeploymentConfig" type (accepted)
3. Month 2: Discover "APIEndpoint" type (accepted)
4. Month 3: Add custom "SecurityControl" type (manual)
5. Month 4: Reprocess all documents with new types
6. Result: Rich, project-specific schema evolved from data
```

## UI Components Needed

### Admin Panel Pages:
1. **Template Gallery** - Browse/install/customize templates
2. **Type Registry** - View all types (template/custom/discovered)
3. **Object Browser** - List/filter/search objects by type
4. **Object Editor** - Schema-driven form for CRUD
5. **Discovery Dashboard** - Review type suggestions
6. **Ingestion Monitor** - Track extraction jobs
7. **Provenance Viewer** - See object lineage

### Key UI Features:
- Type filter sidebar with counts
- Confidence badges on extracted objects
- "Needs Review" queue
- Visual relationship graph
- Schema editor for custom types
- Reprocessing preview ("what would change?")

## Implementation Phases

### Phase 1: Foundation (4-6 weeks)
- Database schema for templates, registry, jobs
- Template pack CRUD APIs
- Project template assignment
- Manual object CRUD with validation
- Basic extraction job framework

### Phase 2: Smart Ingestion (4-6 weeks)
- Type-aware extraction prompts
- Entity linking (duplicate detection)
- Relationship inference
- Confidence scoring
- Review queue

### Phase 3: Type Discovery (4-6 weeks)
- Pattern analysis engine
- Schema inference algorithm
- Type suggestion workflow
- Review/acceptance UI

### Phase 4: Reprocessing (3-4 weeks)
- Reprocessing job type
- Merge strategies
- Provenance tracking
- Impact preview

### Phase 5: Polish (2-3 weeks)
- UI refinements
- Performance optimization
- Analytics/metrics
- Documentation

**Total: ~5-6 months for full system**

## Technical Stack

**Backend:**
- NestJS modules: TemplateModule, GraphObjectModule, ExtractionModule, DiscoveryModule
- PostgreSQL with existing graph tables extended
- Bull queue for extraction jobs
- OpenAI/Anthropic for extraction + schema inference

**Frontend:**
- React + TypeScript
- Dynamic form generation from JSON Schema
- React Flow for relationship graphs
- Tailwind + daisyUI for UI

**AI/ML:**
- Embeddings for similarity matching
- LLM for extraction (type-specific prompts)
- Clustering for pattern detection
- Schema inference from examples

## Key Advantages

| Feature | Benefit |
|---------|---------|
| **Template-based** | Start fast, proven structures |
| **AI extraction** | 80%+ automation of data entry |
| **Type discovery** | Adapts to your specific needs |
| **Reprocessing** | Improve over time without data loss |
| **Provenance** | Full auditability |
| **Schema validation** | Data quality enforced |
| **No lock-in** | Mix templates + custom types |
| **Relationship intelligence** | Auto-link related items |
| **Confidence scoring** | Focus review on uncertain items |
| **Evolution support** | Schema changes don't break |

## Success Metrics

- **Time to value**: New project → first structured data in < 1 hour
- **Automation rate**: > 80% of objects extracted vs manual entry
- **Type discovery acceptance**: > 75% of suggestions accepted
- **Extraction accuracy**: > 85% confidence on average
- **Review queue**: < 20% of objects need manual review
- **Reprocessing safety**: 0 data loss incidents
- **User adoption**: Active object creation/editing by 80%+ of users

## Next Steps

### Immediate (This Week):
1. ✅ Review and approve design docs
2. Create database migrations for new tables
3. Set up NestJS module structure

### Near-term (Next 2 Weeks):
1. Implement template pack loader
2. Build project type registry
3. Create manual object CRUD endpoints
4. Add schema validation layer

### Short-term (Month 1-2):
1. Build extraction job framework
2. Implement type-aware prompts
3. Create entity linking logic
4. Add review queue APIs

### Medium-term (Month 3-4):
1. Build pattern analysis engine
2. Implement schema inference
3. Create type discovery UI
4. Add reprocessing capability

## Questions for Decision

1. **Template Source**: Should we support user-contributed templates (marketplace)?
2. **Type Naming**: Auto-generated names vs user-required naming?
3. **Schema Versioning**: How to handle breaking schema changes?
4. **Cross-project Types**: Should types be shareable across projects in org?
5. **Export/Import**: Should projects be exportable with their custom types?
6. **AI Provider**: OpenAI vs Anthropic vs local models for extraction?
7. **Reprocessing Triggers**: Manual only or automatic on schema change?

## Resources

- **TOGAF Documentation**: https://pubs.opengroup.org/togaf-standard/
- **JSON Schema**: https://json-schema.org/
- **Entity Linking Papers**: Research on duplicate detection algorithms
- **Schema Inference**: Algorithms for inferring structure from examples

## Conclusion

This system provides a **powerful, flexible, and intelligent** approach to managing structured enterprise architecture data. It combines the **best of both worlds**:

- **Human expertise** via curated templates and manual refinement
- **AI automation** for extraction, discovery, and relationship inference

The result is a system that:
- ✅ Reduces manual data entry by 80%+
- ✅ Maintains high data quality through schemas
- ✅ Adapts to project-specific needs
- ✅ Improves continuously over time
- ✅ Provides full audit trail
- ✅ Enables powerful querying and visualization

**Ready to implement!** 🚀
