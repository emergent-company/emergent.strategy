# Missing Template Packs - TOGAF and Meeting Packs

**Date**: 2025-10-18  
**Status**: Packs exist in code but not seeded to database

## Current State

Only **1 pack** exists in database:
- ✅ Extraction Demo Pack v1.0.0 (Person, Organization, Location)

## Missing Packs

### 1. TOGAF Core Template Pack

**Location**: `reference/togaf-core-template-pack.json`  
**Version**: 1.0.0  
**Description**: Core TOGAF architecture artifact types for IT projects

**Object Types** (8):
1. **Capability** - Business capability (what the organization can do)
2. **Requirement** - System or business requirement
3. **Decision** - Architecture Decision Record (ADR)
4. **ApplicationComponent** - Software application or system
5. **DataEntity** - Logical data entity or domain model
6. **Interface** - API or system interface
7. **Risk** - Project or technical risk
8. **WorkPackage** - Deliverable work package

**Relationship Types** (11):
- trace_to, refine, satisfy, implement, depend_on, address, uses, stores_in, integrate_with, owns, decides

**Features**:
- Extraction prompts for Requirement and Decision types
- SQL views (capability_map, requirements_traceability, application_portfolio, risk_register)
- TOGAF ADM phase mapping
- UI configurations for forms

### 2. Meeting & Decision Management Pack

**Location**: `apps/server/src/modules/template-packs/seeds/meeting-decision-pack.seed.ts`  
**Pack ID**: `9f8d7e6c-5b4a-4c2d-8e0f-9a8b7c6d5e4f`  
**Version**: 1.0.0  
**Description**: Template pack for managing meetings, decisions, action items, and questions

**Object Types** (4):
1. **Meeting** - Meeting event with attendees, agenda, and outcomes
   - Types: standup, planning, retrospective, review, one-on-one, etc.
   - Status: scheduled, in-progress, completed, cancelled
2. **Decision** - Decision made in meetings or independently
3. **ActionItem** - Actionable tasks from meetings or decisions
4. **Question** - Questions raised that need answers

**Features**:
- Comprehensive meeting management
- Decision tracking with alternatives
- Action item assignment and tracking
- Question/answer management

## How to Seed the Packs

### Option 1: Seed Meeting Pack (Script Exists)

```bash
# Run the seed script
npm run seed:meeting-pack

# Or use the TypeScript version
npx tsx scripts/seed-meeting-pack.ts
```

### Option 2: Seed TOGAF Pack (Manual)

The TOGAF pack exists as JSON but doesn't have a seed script yet. You would need to:

1. **Create a seed script** similar to `meeting-decision-pack.seed.ts`
2. **Transform the JSON** to match the database schema
3. **Insert into** `kb.graph_template_packs`

**Quick SQL Insert** (simplified):

```sql
INSERT INTO kb.graph_template_packs (
    id,
    name,
    version,
    description,
    author,
    object_type_schemas,
    relationship_type_schemas,
    extraction_prompts,
    sql_views,
    published_at
) VALUES (
    gen_random_uuid(),
    'TOGAF Core',
    '1.0.0',
    'Core TOGAF architecture artifact types for IT projects',
    'Nexus Platform',
    -- Read from reference/togaf-core-template-pack.json objectTypes
    '{...}'::jsonb,
    -- Read from reference/togaf-core-template-pack.json relationshipTypes  
    '{...}'::jsonb,
    -- Read from reference/togaf-core-template-pack.json extractionPrompts
    '{...}'::jsonb,
    -- Read from reference/togaf-core-template-pack.json views
    '[]'::jsonb,
    NOW()
);
```

### Option 3: Create Comprehensive Seed Script

Create a new script that reads the TOGAF JSON and inserts it properly:

```typescript
// scripts/seed-togaf-pack.ts
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

async function seedTogafPack() {
    const pool = new Pool({
        host: 'localhost',
        port: 5432,
        database: 'spec',
        user: 'spec',
        password: process.env.POSTGRES_PASSWORD || 'spec'
    });

    try {
        // Read the JSON file
        const packJson = JSON.parse(
            fs.readFileSync(
                path.join(__dirname, '../reference/togaf-core-template-pack.json'),
                'utf-8'
            )
        );

        // Transform objectTypes array to object_type_schemas object
        const objectTypeSchemas = {};
        for (const type of packJson.objectTypes) {
            objectTypeSchemas[type.type] = type.jsonSchema;
        }

        // Transform relationshipTypes array to relationship_type_schemas object
        const relationshipTypeSchemas = {};
        for (const rel of packJson.relationshipTypes) {
            relationshipTypeSchemas[rel.type] = rel;
        }

        // Insert into database
        await pool.query(`
            INSERT INTO kb.graph_template_packs (
                id, name, version, description, author,
                object_type_schemas, relationship_type_schemas,
                extraction_prompts, sql_views, published_at
            ) VALUES (
                gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW()
            )
            ON CONFLICT (name, version) DO UPDATE SET
                description = EXCLUDED.description,
                object_type_schemas = EXCLUDED.object_type_schemas,
                relationship_type_schemas = EXCLUDED.relationship_type_schemas,
                updated_at = NOW()
        `, [
            packJson.name,
            packJson.version,
            packJson.description,
            packJson.author,
            JSON.stringify(objectTypeSchemas),
            JSON.stringify(relationshipTypeSchemas),
            JSON.stringify(packJson.extractionPrompts || {}),
            JSON.stringify(packJson.views || [])
        ]);

        console.log('✅ TOGAF pack seeded successfully');
    } catch (error) {
        console.error('❌ Error seeding TOGAF pack:', error);
        throw error;
    } finally {
        await pool.end();
    }
}

seedTogafPack();
```

## Installation After Seeding

Once packs are seeded to `kb.graph_template_packs`, install them to your project:

```bash
# Via API
POST /api/template-packs/projects/342b78f5-2904-4e1a-ae41-9c2d481a3a46/assign
{
  "template_pack_id": "<pack-id-from-database>"
}

# Or via UI
Go to: Settings → Project Settings → Templates
Click "Install" on the pack you want
```

## Why They're Missing

The packs exist in the codebase but were never executed/seeded:
1. **TOGAF**: Reference JSON exists but no seed script
2. **Meeting Pack**: Seed script exists but wasn't run during initial setup

## Recommended Actions

1. **Immediate**: Run meeting pack seed script
   ```bash
   npm run seed:meeting-pack
   ```

2. **Create TOGAF seed script**: Use the template above

3. **Update setup docs**: Add pack seeding to initial setup instructions

4. **Consider migration**: Add pack seeding to database migrations for fresh installs

## Related Files

- TOGAF JSON: `reference/togaf-core-template-pack.json`
- Meeting seed: `apps/server/src/modules/template-packs/seeds/meeting-decision-pack.seed.ts`
- Seed script: `scripts/seed-meeting-pack.ts`
- Service: `apps/server/src/modules/template-packs/template-pack.service.ts`
