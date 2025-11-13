# Template Pack Seeding - Complete Summary

## Overview
All three template packs are now successfully seeded in the database and ready to use.

## Template Packs Available

### 1. Extraction Demo Pack ✅
**Purpose:** Demonstrates basic entity extraction with simple schemas

**Pack ID:** `f47ac10b-58cc-4372-a567-0e02b2c3d479`

**Contents:**
- 3 Object Types: Person, Organization, Location
- Basic relationship types for demo purposes
- Simple extraction prompts

**Status:** Already seeded (pre-existing)

**Seed Command:**
```bash
npx tsx scripts/seed-extraction-demo-pack.ts
```

---

### 2. TOGAF Enterprise Architecture Pack ✅
**Purpose:** Comprehensive IT enterprise architecture aligned with TOGAF framework

**Pack ID:** `296a39bd-0d1d-4b94-8eef-1510dbd03633`

**Contents:**
- 13 Object Types:
  - BusinessCapability
  - BusinessProcess
  - Application
  - ApplicationComponent
  - DataEntity
  - TechnologyComponent
  - InformationSystemService
  - Platform
  - Node
  - Actor
  - Role
  - BusinessService
  - ValueStream

- 4 Relationship Types:
  - maps_to
  - realizes
  - supported_by
  - communicates_with

- 2 SQL Views for advanced querying
- UI configurations for all types
- TOGAF-aligned extraction prompts

**Status:** Seeded successfully on 2025-01-17

**Seed Command:**
```bash
npx tsx scripts/seed-togaf-template.ts
```

**Verification:**
```bash
psql spec -c "SELECT name, version, jsonb_object_keys(object_type_schemas) as object_types FROM kb.graph_template_packs WHERE name = 'TOGAF Enterprise Architecture';"
```

---

### 3. Meeting & Decision Management Pack ✅
**Purpose:** Capture and track meetings, decisions, action items, and questions

**Pack ID:** `9f8d7e6c-5b4a-3c2d-1e0f-9a8b7c6d5e4f`

**Contents:**
- 5 Object Types:
  - Meeting
  - MeetingSeries
  - Decision
  - ActionItem
  - Question

- 25 Relationship Types covering:
  - Meeting organization (part_of_series, parent_meeting)
  - Decision tracking (made_in, impacts, supersedes)
  - Action item management (assigned_in, assigned_to, blocks)
  - Question handling (asked_in, answered_by, relates_to)
  - Dependencies and follow-ups

- Complete UI configurations
- AI-assisted extraction prompts

**Status:** Seeded successfully on 2025-01-17 (after fixing password issue)

**Seed Command:**
```bash
npx tsx scripts/seed-meeting-pack.ts
```

**Verification:**
```bash
psql spec -c "SELECT name, version, jsonb_object_keys(object_type_schemas) as object_types FROM kb.graph_template_packs WHERE name = 'Meeting & Decision Management';"
```

---

## Installation to Projects

After seeding, template packs need to be installed to specific projects via the UI:

1. Navigate to Settings → Templates
2. Browse available template packs
3. Click "Install" on the pack you want to use
4. Select the target project
5. Confirm installation

This will:
- Copy the object type schemas to the project's type registry
- Copy relationship type definitions
- Copy UI configurations
- Copy extraction prompts
- Make types available for document extraction

## Database Schema

Template packs are stored in `kb.graph_template_packs`:

```sql
CREATE TABLE kb.graph_template_packs (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    description TEXT,
    author TEXT,
    license TEXT,
    repository_url TEXT,
    documentation_url TEXT,
    object_type_schemas JSONB NOT NULL,  -- Object keys are type names
    relationship_type_schemas JSONB,
    ui_configs JSONB,
    extraction_prompts JSONB,
    sql_views JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

## Frontend Display Fix

Template packs now display the correct number of object types. The issue was:

**Problem:** Backend stored object types as keys in `object_type_schemas` JSONB object, but frontend expected an `object_types` array.

**Solution:** Transform in `TemplatePackService.getProjectTemplatePacks()`:

```typescript
return result.rows.map(row => ({
    ...row,
    template_pack: {
        ...row.template_pack,
        object_types: row.template_pack.object_type_schemas 
            ? Object.keys(row.template_pack.object_type_schemas)
            : []
    }
}));
```

Now the UI correctly shows:
- Extraction Demo Pack: **3 object types**
- TOGAF EA Pack: **13 object types**
- Meeting Pack: **5 object types**

## Seed Script Pattern

All seed scripts now follow the same pattern:

```typescript
import { Client, Pool } from 'pg';
import { config } from 'dotenv';

config(); // Load .env

// For scripts that need a client connection
const client = new Client({
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432'),
    database: process.env.PGDATABASE || 'spec',
    user: process.env.PGUSER || 'spec',
    password: process.env.PGPASSWORD || 'spec',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

await client.connect();
// ... do work
await client.end();
```

**Key points:**
- Use standard `PG*` environment variables
- Provide sensible defaults for local development
- Support SSL for production environments
- Never use `password: process.env.VAR || ''` (causes SCRAM auth errors)

## Troubleshooting

### Password Errors
If you see: `SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string`

**Solution:** Either:
1. Set `PGPASSWORD` environment variable
2. Or use peer authentication (omit password entirely)
3. Never use empty string `''` as password

### Pack Already Exists
If seed script reports pack already exists:

```bash
# Check existing packs
psql spec -c "SELECT id, name, version FROM kb.graph_template_packs;"

# Delete specific pack if needed (use with caution!)
psql spec -c "DELETE FROM kb.graph_template_packs WHERE id = '<pack-id>';"
```

### Verification Queries
```sql
-- List all packs
SELECT id, name, version, 
       jsonb_object_keys(object_type_schemas) as types_count
FROM kb.graph_template_packs;

-- Get full pack details
SELECT * FROM kb.graph_template_packs WHERE name = 'TOGAF Enterprise Architecture';

-- Check installed packs for a project
SELECT gtp.name, gtp.version
FROM kb.graph_template_packs gtp
JOIN kb.project_template_pack_installs ptpi ON ptpi.template_pack_id = gtp.id
WHERE ptpi.project_id = '<project-uuid>';
```

## Related Documentation
- `/docs/MISSING_TEMPLATE_PACKS.md` - Original investigation
- `/docs/MEETING_PACK_SEED_FIX.md` - Password issue fix
- `/docs/TEMPLATE_PACK_OBJECT_TYPES_FIX.md` - Display issue fix
- `apps/server/src/modules/template-packs/seeds/` - All seed functions

## Success Criteria
- [x] All three template packs seeded to database
- [x] TOGAF pack: 13 types available
- [x] Meeting pack: 5 types available  
- [x] Frontend displays correct type counts
- [x] Packs installable via UI
- [x] Documentation complete

## Next Steps
1. Install desired template packs to test project via UI
2. Test entity extraction using installed types
3. Verify extraction prompts work with AI
4. Create custom packs as needed for specific domains
