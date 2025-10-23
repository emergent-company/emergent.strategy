# Quick Guide: Seed Missing Template Packs

## Current Status
- ✅ **Extraction Demo Pack** - Already seeded (Person, Organization, Location)
- ❌ **TOGAF Pack** - Not seeded yet (8 types)
- ❌ **Meeting Pack** - Not seeded yet (4 types)

## Seed Scripts Available

All scripts exist in `scripts/` directory:
1. ✅ `seed-extraction-demo.ts` (already run)
2. ⏳ `seed-togaf-template.ts` (ready to run)
3. ⏳ `seed-meeting-pack.ts` (ready to run)

## How to Seed

### Seed TOGAF Pack (8 Types)

```bash
npx tsx scripts/seed-togaf-template.ts
```

**Types it will add:**
- BusinessCapability, Requirement, Decision, ApplicationComponent, DataEntity, Interface, Risk, WorkPackage

### Seed Meeting Pack (4 Types)

```bash
npx tsx scripts/seed-meeting-pack.ts
```

**Types it will add:**
- Meeting, Decision, ActionItem, Question

### Verify Packs Were Seeded

```sql
SELECT name, version, 
       jsonb_object_keys(object_type_schemas) as type_names
FROM kb.graph_template_packs;
```

Or via API:
```bash
curl http://localhost:5175/api/template-packs/projects/342b78f5-2904-4e1a-ae41-9c2d481a3a46/available
```

## Install Packs to Project

After seeding, go to UI:
1. Navigate to: **Settings → Project Settings → Templates**
2. Click **"Install"** on each pack you want
3. Refresh the page - you should see "8 object types" (TOGAF) and "4 object types" (Meeting)

## Expected Result

After seeding and installing all three packs, you'll have:

| Pack | Version | Types | Status |
|------|---------|-------|--------|
| Extraction Demo Pack | 1.0.0 | 3 (Person, Organization, Location) | ✅ Installed |
| TOGAF Enterprise Architecture | 1.0.0 | 8 (Capability, Requirement, Decision, etc.) | ⏳ To install |
| Meeting & Decision Management | 1.0.0 | 4 (Meeting, Decision, ActionItem, Question) | ⏳ To install |

**Total Types Available**: 15 object types

## Troubleshooting

If seed fails with connection error:
```bash
# Check PostgreSQL is running
npm run workspace:status

# Verify credentials match
echo $POSTGRES_PASSWORD
# Should match password in docker/.env
```

If pack already exists:
- Scripts use `ON CONFLICT ... DO UPDATE` so they're safe to re-run
- They will update existing packs instead of failing

## Next Steps

1. Run both seed scripts
2. Refresh the Templates page in UI
3. Install the packs you need
4. Start extracting with the new types!
