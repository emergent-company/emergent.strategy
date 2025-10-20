# Discovery Wizard Flow

## Complete Step Sequence

```
┌─────────────────────────────────────────────────────────────────┐
│                    Discovery Wizard Flow                         │
└─────────────────────────────────────────────────────────────────┘

Step 1: Configure Discovery
────────────────────────────
├─ Knowledge Base Purpose (textarea)
├─ Context Source: Documents or Project State
└─ Continue → Step 2

Step 2: Analyzing
──────────────────
├─ Creating Discovery Job
├─ Running LLM Analysis (progress indicator)
├─ Processing Results
└─ Auto-advance → Step 3

Step 3: Review Types
─────────────────────
├─ Discovered Entity Types (list)
├─ Each type shows:
│  ├─ Type Name
│  ├─ Description
│  ├─ Frequency Count
│  ├─ Example Instances (key-value pairs)
│  └─ Delete Button
├─ User can remove unwanted types
└─ Continue → Step 4

Step 4: Review Relationships
──────────────────────────────
├─ Discovered Relationships (list)
├─ Each relationship shows:
│  ├─ FROM Type (blue badge)
│  ├─ Relationship Name (green badge, larger)
│  ├─ TO Type (purple badge)
│  ├─ Cardinality (normalized: one-to-one, many-to-one, etc.)
│  └─ Delete Button
├─ Auto-filtered when types are removed in Step 3
└─ Continue → Step 4.5

Step 4.5: Configure Pack ⭐ NEW
────────────────────────────────
├─ Mode Selection (radio buttons):
│  ├─ Create New Pack
│  │  ├─ Pack Name Input (editable)
│  │  └─ Default: "Discovery Pack - [date]"
│  └─ Extend Existing Pack
│     ├─ Pack Name Input (read-only, auto-filled)
│     ├─ Existing Packs List:
│     │  ├─ Search/Filter
│     │  ├─ Pack Cards:
│     │  │  ├─ Name
│     │  │  ├─ Description
│     │  │  └─ Type/Relationship Counts
│     │  └─ Click to Select
│     └─ Selected Pack Highlighted
├─ Validation:
│  ├─ Create: name required
│  └─ Extend: pack selection required
└─ Continue → Step 5

Step 5: Complete
─────────────────
├─ Success Icon ✓
├─ Template Pack Summary:
│  ├─ Pack Name
│  ├─ Mode (Create/Extend)
│  ├─ Entity Types: 3 / 14 (11 excluded)
│  ├─ Relationships: 1 / 15 (14 excluded)
│  └─ Pack ID (if generated)
├─ Detailed Type List (collapsible):
│  └─ Shows all types with included/excluded status
├─ Actions:
│  ├─ View Pack Details
│  ├─ Install Pack
│  ├─ Close Wizard
│  └─ Start New Discovery
└─ End
```

## State Transitions

```
┌────────┐     ┌────────┐     ┌────────┐     ┌────────┐
│ Step 1 │────▶│ Step 2 │────▶│ Step 3 │────▶│ Step 4 │
│Configure│    │Analyzing│    │ Review │    │ Review │
│         │    │         │    │ Types  │    │  Rels  │
└────────┘     └────────┘     └───┬────┘     └───┬────┘
                                   │              │
                                   │              │
                                   ▼              ▼
                              ┌────────┐     ┌────────┐
                              │  Back  │     │Step 4.5│
                              │  Navs  │     │Configure│
                              └────────┘     │  Pack  │
                                             └───┬────┘
                                                 │
                                                 ▼
                                            ┌────────┐
                                            │ Step 5 │
                                            │Complete│
                                            └────────┘
```

## Data Flow

```
User Input (Step 1)
    ├─ kb_purpose
    ├─ context_source
    └─ selectedDocuments / include_project_state
         │
         ▼
Backend Processing (Step 2)
    ├─ Create discovery_job
    ├─ Run LLM analysis
    └─ Store discovered_types, discovered_relationships
         │
         ▼
User Edits (Step 3 & 4)
    ├─ Remove unwanted types → editedTypes[]
    ├─ Auto-filter relationships
    └─ Remove unwanted relationships → editedRelationships[]
         │
         ▼
Pack Configuration (Step 4.5)
    ├─ Choose mode: create | extend
    ├─ Set pack name
    └─ Select existing pack (if extending)
         │
         ▼
Pack Config Object
    {
        mode: 'create' | 'extend',
        packName: string,
        existingPackId?: string
    }
         │
         ▼
Template Pack Creation (Backend - Future)
    ├─ CREATE: POST /api/template-packs
    │   └─ { name, types, relationships }
    └─ EXTEND: PUT /api/template-packs/{id}
        └─ { types, relationships }
```

## Key State Variables

```typescript
// Wizard Component State
const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 4.5 | 5>(1);
const [jobId, setJobId] = useState<string | null>(null);
const [jobData, setJobData] = useState<DiscoveryJob | null>(null);

// User Edits
const [editedTypes, setEditedTypes] = useState<TypeCandidate[]>([]);
const [editedRelationships, setEditedRelationships] = useState<Relationship[]>([]);

// Pack Configuration ⭐ NEW
const [packConfig, setPackConfig] = useState<PackConfig | null>(null);
```

## Navigation Rules

### Forward Navigation
- Step 1 → Step 2: After submitting configuration
- Step 2 → Step 3: Automatic when analysis completes
- Step 3 → Step 4: User clicks "Continue" (with edited types)
- Step 4 → Step 4.5: User clicks "Continue" (with edited relationships)
- Step 4.5 → Step 5: User clicks "Continue" (with pack config)

### Backward Navigation
- Step 3 → Step 2: Not allowed (analysis is complete)
- Step 4 → Step 3: Click "Back" button
- Step 4.5 → Step 4: Click "Back" button
- Step 5: No back navigation (final step)

### Reset
- Any step → Step 1: Click "Start New Discovery" or close wizard
- Clears: jobId, jobData, editedTypes, editedRelationships, packConfig

## Pack Configuration Options

### Create New Pack
```typescript
{
    mode: 'create',
    packName: 'My Custom Pack',  // User-provided name
    existingPackId: undefined
}
```

### Extend Existing Pack
```typescript
{
    mode: 'extend',
    packName: 'Existing Pack Name',  // Auto-filled from selection
    existingPackId: 'uuid-of-existing-pack'
}
```

## Summary Display

Step 5 displays:

1. **Pack Information** (from packConfig)
   - Name
   - Mode (Create/Extend with pack ID if extending)

2. **Discovery Results** (from editedTypes/Relationships)
   - Entity Types: X / Y (Z excluded)
   - Relationships: X / Y (Z excluded)

3. **Type Details** (collapsible)
   - ✓ Included types (normal display)
   - ✗ Excluded types (grayed out, line-through)
   - Shows all original types with status indicators

## Error States

### Step 2 (Analysis)
- LLM errors
- Timeout
- No types discovered
→ Show error message, allow retry or back to Step 1

### Step 4.5 (Pack Config)
- Failed to load existing packs
→ Show error message, allow retry or proceed with create mode only

### Step 5 (Pack Creation - Future)
- Failed to create pack
- Failed to extend pack
- Validation errors
→ Show error message, allow retry or back to Step 4.5
