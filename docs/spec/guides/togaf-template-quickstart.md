# TOGAF Template System - Quickstart Guide

This guide shows how to use the dynamic type discovery and template system for TOGAF-like project management.

## User Workflows

### 1. Install Template Pack (Project Admin)

```bash
# Browse available templates
GET /api/projects/123/templates/available

# Install TOGAF Core template
POST /api/projects/123/templates/install
{
  "templatePackId": "togaf-core-v1",
  "customizations": {
    "enabledTypes": ["Requirement", "Decision", "ApplicationComponent", "Risk"],
    "disabledTypes": ["Plateau", "Gap"] // Not needed for this project
  }
}
```

**What happens:**
- System validates template compatibility
- Creates entries in `project_object_type_registry` for each enabled type
- Sets up UI configs (icons, colors, form layouts)
- User can now create objects of these types

### 2. Browse Type Registry

```bash
GET /api/projects/123/type-registry

Response:
[
  {
    "type": "Requirement",
    "source": "template",
    "templatePackName": "TOGAF Core",
    "schema": { /* JSON Schema */ },
    "uiConfig": {
      "icon": "lucide--clipboard-check",
      "color": "#10B981",
      "formLayout": [...]
    },
    "objectCount": 42,
    "enabled": true
  },
  {
    "type": "CustomChecklistItem",
    "source": "custom",
    "objectCount": 5,
    "enabled": true
  }
]
```

### 3. Create Object Manually

```bash
POST /api/projects/123/objects
{
  "type": "Requirement",
  "title": "System must support SSO authentication",
  "properties": {
    "category": "functional",
    "priority": "must",
    "status": "draft",
    "rationale": "Enterprise customers require single sign-on",
    "acceptance_criteria": [
      "SAML 2.0 support",
      "OAuth 2.0 / OIDC support",
      "Multi-tenant configuration"
    ],
    "risk_level": "high"
  },
  "labels": ["security", "auth"],
  "relationships": [
    {
      "type": "trace_to",
      "targetObjectId": "goal-456",
      "direction": "outbound"
    }
  ]
}
```

**What happens:**
- System loads JSON schema for "Requirement" type
- Validates properties against schema
- Creates graph object with proper typing
- Creates relationship if specified
- Returns created object with ID

### 4. Trigger Document Ingestion

Upload a requirements document:

```bash
POST /api/projects/123/documents
Content-Type: multipart/form-data

file: requirements-spec-v2.pdf
```

Then trigger extraction:

```bash
POST /api/projects/123/extraction/jobs
{
  "documentId": "doc-789",
  "enabledTypes": ["Requirement", "Decision", "Risk"],
  "extractRelationships": true,
  "minConfidence": 0.7,
  "requireReview": false
}

Response:
{
  "jobId": "job-abc123",
  "status": "pending",
  "estimatedDuration": "2-5 minutes"
}
```

**What happens behind the scenes:**

1. **Document Processing**
   - Document chunked into semantic sections
   - Each chunk analyzed for extractable objects

2. **Object Extraction** (per enabled type)
   ```typescript
   // For Requirement type
   const prompt = `
   Extract requirements from this text.
   Return JSON array matching this schema:
   ${JSON.stringify(requirementSchema)}
   
   Text:
   ${chunk.text}
   `;
   
   const extracted = await llm.complete(prompt);
   // Returns: [{ title: "...", category: "functional", ... }]
   ```

3. **Entity Linking**
   ```typescript
   for (const extracted of extractedObjects) {
     // Check if similar object exists
     const existing = await findSimilar(extracted, {
       threshold: 0.9,
       fields: ['title', 'properties.description']
     });
     
     if (existing) {
       // Merge strategy
       await mergeObjects(existing, extracted, job.id);
     } else {
       // Create new
       await createGraphObject({
         ...extracted,
         extraction_job_id: job.id,
         extraction_confidence: 0.85,
         needs_review: false
       });
     }
   }
   ```

4. **Relationship Inference**
   ```typescript
   // Look for relationship patterns
   const relationshipPrompt = `
   Given these extracted objects, identify relationships:
   Objects: ${JSON.stringify(extractedObjects)}
   
   Allowed relationship types:
   - trace_to (requirement -> goal)
   - satisfy (feature -> requirement)
   - address (decision -> risk)
   
   Return JSON array of relationships.
   `;
   
   const relationships = await llm.complete(relationshipPrompt);
   // Creates relationships between objects
   ```

### 5. Monitor Extraction Progress

```bash
GET /api/projects/123/extraction/jobs/job-abc123

Response:
{
  "id": "job-abc123",
  "status": "processing",
  "progress": {
    "chunksProcessed": 45,
    "chunksTotal": 120,
    "objectsCreated": 23,
    "relationshipsCreated": 15
  },
  "startedAt": "2025-10-02T14:30:00Z"
}
```

### 6. Review Extracted Objects

```bash
GET /api/projects/123/objects?extraction_job_id=job-abc123&needs_review=true

Response:
[
  {
    "id": "obj-xyz",
    "type": "Requirement",
    "title": "API rate limiting must prevent abuse",
    "properties": { /* ... */ },
    "extraction_confidence": 0.72,
    "needs_review": true,
    "evidence": {
      "chunk_id": "chunk-456",
      "confidence": 0.72,
      "source_text": "The system should implement..."
    }
  }
]
```

User can approve or edit:

```bash
PATCH /api/projects/123/objects/obj-xyz
{
  "properties": {
    "category": "non-functional", // Corrected by user
    "priority": "must"  // Added by user
  },
  "needs_review": false,
  "reviewed_by": "user-123"
}
```

### 7. Type Discovery - System Suggests New Types

While processing documents, system notices repeating patterns:

```bash
# System creates type suggestion
INSERT INTO object_type_suggestions (
  project_id,
  suggested_type: "SecurityControl",
  description: "Security control measures",
  confidence: 0.83,
  inferred_schema: {
    "properties": {
      "control_id": { "type": "string" },
      "category": { "enum": ["authentication", "authorization", "encryption"] },
      "implementation_status": { "enum": ["planned", "implemented", "verified"] }
    }
  },
  example_instances: [
    {
      "title": "Implement MFA for admin access",
      "control_id": "SEC-001",
      "category": "authentication"
    },
    {
      "title": "Encrypt data at rest using AES-256",
      "control_id": "SEC-002",
      "category": "encryption"
    }
  ],
  frequency: 12,
  source: "pattern_analysis"
)
```

User reviews suggestions:

```bash
GET /api/projects/123/type-suggestions

Response:
[
  {
    "id": "sugg-123",
    "suggestedType": "SecurityControl",
    "confidence": 0.83,
    "description": "Found 12 instances of security control mentions",
    "inferredSchema": { /* ... */ },
    "exampleInstances": [ /* ... */ ],
    "status": "pending"
  }
]
```

User accepts suggestion:

```bash
POST /api/projects/123/type-suggestions/sugg-123/review
{
  "action": "accept",
  "customizations": {
    "finalTypeName": "SecurityControl",
    "schemaAdjustments": {
      "properties": {
        "owner": { "type": "string" }, // User adds field
        "compliance_framework": { 
          "enum": ["SOC2", "ISO27001", "GDPR"]  // User adds field
        }
      }
    }
  },
  "reprocessExisting": true
}
```

**What happens:**
- New type "SecurityControl" added to project registry
- Schema stored with user customizations
- Reprocessing job triggered to extract SecurityControl from existing documents
- Previously untyped objects matched and converted

### 8. Reprocessing After Type Addition

```bash
POST /api/projects/123/extraction/reprocess
{
  "newTypes": ["SecurityControl"],
  "documentIds": ["doc-789", "doc-101"], // or omit for all docs
  "strategy": "merge"
}

Response:
{
  "jobId": "job-def456",
  "preview": {
    "documentsToScan": 2,
    "estimatedNewObjects": 8,
    "estimatedUpdatedObjects": 3
  }
}
```

Reprocessing uses merge strategy:

```typescript
async function reprocessWithNewType(doc: Document, newType: string) {
  // Extract objects of new type
  const extracted = await extractObjectsOfType(doc, newType);
  
  for (const obj of extracted) {
    // Check if was previously extracted as generic entity
    const existing = await findBySourceLocation({
      documentId: doc.id,
      chunkId: obj.chunk_id,
      similarity: 0.85
    });
    
    if (existing && existing.type === 'Entity') {
      // Convert generic entity to typed object
      await convertToType(existing, newType, obj.properties);
    } else if (existing) {
      // Merge properties (additive)
      await mergeProperties(existing, obj.properties);
    } else {
      // New object
      await createGraphObject(obj);
    }
  }
}
```

## UI Workflows

### Template Gallery
```
┌─────────────────────────────────────────┐
│ Project Settings > Templates            │
├─────────────────────────────────────────┤
│                                         │
│ Available Templates                     │
│ ┌───────────────┐  ┌───────────────┐  │
│ │ TOGAF Core    │  │ Agile PM      │  │
│ │ v1.0.0        │  │ v2.1.0        │  │
│ │               │  │               │  │
│ │ 12 types      │  │ 8 types       │  │
│ │ [Install]     │  │ [Install]     │  │
│ └───────────────┘  └───────────────┘  │
│                                         │
│ Installed Templates                     │
│ ✓ TOGAF Core (12 types active)         │
│   [Customize] [Uninstall]               │
└─────────────────────────────────────────┘
```

### Object Browser with Type Filter
```
┌─────────────────────────────────────────┐
│ Objects                    [+ Create]   │
├──────────┬──────────────────────────────┤
│ Types    │                              │
│ ☑ All    │ Title                Status  │
│ ☑ Req... │ ───────────────────────────  │
│ ☑ Deci...│ □ SSO Authentication  Draft  │
│ ☑ Risk   │   Requirement | 0.85 conf    │
│ ☐ App... │                              │
│ ☐ Data...│ □ Use PostgreSQL      Accept │
│          │   Decision | Manual          │
│ Custom   │                              │
│ ☐ Check..│ □ Data breach risk    Open   │
│          │   Risk | 0.91 conf           │
│ Discover │                              │
│ □ Secur..│ 🔍 Showing 3 of 127          │
│   (12)   │                              │
└──────────┴──────────────────────────────┘
```

### Discovery Dashboard
```
┌─────────────────────────────────────────┐
│ Type Discovery                          │
├─────────────────────────────────────────┤
│                                         │
│ Pending Suggestions                     │
│ ┌─────────────────────────────────────┐│
│ │ SecurityControl              83%    ││
│ │ Found 12 similar instances          ││
│ │                                     ││
│ │ Examples:                           ││
│ │ • Implement MFA for admin access    ││
│ │ • Encrypt data at rest with AES-256 ││
│ │                                     ││
│ │ Similar to: Risk, Requirement       ││
│ │                                     ││
│ │ [Accept] [Customize] [Reject]       ││
│ └─────────────────────────────────────┘│
│                                         │
│ [Run Discovery on Recent Documents]     │
└─────────────────────────────────────────┘
```

## Benefits of This Approach

### 1. **Flexibility**
- Start with standard templates (TOGAF)
- Customize schemas per project needs
- Add custom types as needed
- System learns from your data

### 2. **Intelligence**
- AI extracts structured data from documents
- Discovers patterns you might miss
- Suggests new types based on usage
- Links related objects automatically

### 3. **Evolution**
- Add new types without database migrations
- Reprocess old data with new schemas
- Merge strategies prevent data loss
- Track provenance of all changes

### 4. **Consistency**
- Schemas enforce data quality
- Relationships validated by type
- UI generated from schemas
- Cross-project type sharing possible

### 5. **Auditability**
- Every object links to source document
- Extraction confidence tracked
- Manual edits recorded
- Reprocessing history maintained

## Next Steps

1. Review the full spec: `docs/spec/24-dynamic-type-discovery-and-ingestion.md`
2. Examine template pack format: `reference/togaf-core-template-pack.json`
3. Implement Phase 1 (Foundation) from the spec
4. Create admin UI for template management
5. Build extraction pipeline with type-aware prompts
