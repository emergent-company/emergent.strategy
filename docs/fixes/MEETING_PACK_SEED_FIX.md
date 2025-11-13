# Meeting Pack Seed Script Fix

## Issue
The meeting pack seed script was failing with:
```
Error: SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string
```

## Root Cause
Two locations had `password: process.env.DB_PASSWORD || ''` which would pass an empty string `''` when the environment variable wasn't set. PostgreSQL's SCRAM authentication requires the password to either be:
1. A non-empty string
2. Not present at all (for peer authentication)

## Files Fixed

### 1. `scripts/seed-meeting-pack.ts`
**Original Problem:**
```typescript
const pool = new Pool({
    // ...
    password: process.env.DB_PASSWORD || '',  // ❌ Empty string causes SCRAM error
});
```

**Solution:**
Simplified the script to create its own pool internally and use standard PG* environment variables like the TOGAF seed:

```typescript
async function seedMeetingDecisionPack(): Promise<void> {
    const pool = new Pool({
        host: process.env.PGHOST || 'localhost',
        port: parseInt(process.env.PGPORT || '5432'),
        database: process.env.PGDATABASE || 'spec',
        user: process.env.PGUSER || 'spec',
        password: process.env.PGPASSWORD || 'spec',  // ✅ Uses standard PG vars
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    });
    
    const { seedMeetingDecisionPack: seedFn } = await import('../apps/server/src/modules/template-packs/seeds/meeting-decision-pack.seed.js');
    await seedFn(pool);
    await pool.end();
}
```

### 2. `apps/server/src/modules/template-packs/seeds/meeting-decision-pack.seed.ts`
**Original Problem:**
```typescript
if (require.main === module) {
    const pool = new Pool({
        // ...
        password: process.env.DB_PASSWORD || '',  // ❌ Same issue
    });
```

**Solution:**
Used spread operator to conditionally include password only if set:
```typescript
const pool = new Pool({
    // ...
    // Don't include password if not set - will use peer authentication
    ...(process.env.DB_PASSWORD && { password: process.env.DB_PASSWORD }),
});
```

## Result
✅ Meeting pack seeded successfully with:
- Pack ID: `9f8d7e6c-5b4a-3c2d-1e0f-9a8b7c6d5e4f`
- 5 Object Types: Meeting, MeetingSeries, Decision, ActionItem, Question
- 25 Relationship Types
- Full UI configurations and extraction prompts

## Environment Variable Strategy
The script now follows the TOGAF seed pattern:
- Uses `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` (standard PostgreSQL env vars)
- Defaults to localhost development values
- Supports SSL connections via `DB_SSL=true`

## Testing
```bash
# Seed the meeting pack
npx tsx scripts/seed-meeting-pack.ts

# Verify it was created
psql spec -c "SELECT id, name, version FROM kb.graph_template_packs WHERE name = 'Meeting & Decision Management';"
```

## Related
- TOGAF pack seed: `scripts/seed-togaf-template.ts` (working reference)
- Extraction demo pack seed: `scripts/seed-extraction-demo-pack.ts` (also working)
