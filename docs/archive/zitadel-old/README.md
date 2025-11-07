# Archived Zitadel Documentation

**Date Archived:** November 7, 2025  
**Reason:** Consolidated into master guide with updated machine-user approach

This directory contains historical Zitadel setup documentation that has been superseded by the comprehensive [Zitadel Setup Guide](../../setup/ZITADEL_SETUP_GUIDE.md).

## Why These Docs Were Archived

The old documentation described a manual setup process that required:
- Creating a human admin user
- Manual email verification (requiring SMTP)
- Manual PAT creation via UI
- Multiple separate guides with overlapping information

The **new approach** (November 2025) uses:
- ✅ Machine user with automatic PAT generation
- ✅ Zero-touch bootstrap (no manual steps)
- ✅ Single comprehensive guide
- ✅ Admin user auto-created with credentials displayed

## Archived Files

### `ZITADEL_BOOTSTRAP_QUICK_START.md` (325 lines)
- **Content:** Quick start guide with manual PAT creation
- **Status:** Outdated - required manual UI interaction
- **Replacement:** See [Quick Start](../../setup/ZITADEL_SETUP_GUIDE.md#quick-start-5-minutes-) in master guide

### `ZITADEL_DUAL_SERVICE_ACCOUNT_SETUP.md` (350 lines)
- **Content:** Dual service account architecture explanation
- **Status:** Outdated - manual setup steps
- **Replacement:** See [Architecture](../../setup/ZITADEL_SETUP_GUIDE.md#architecture) in master guide

### `ZITADEL_DUAL_SERVICE_ACCOUNT_MIGRATION.md` (720 lines)
- **Content:** Migration plan from single to dual service accounts
- **Status:** Migration completed ✓
- **Historical Value:** Documents the migration process

### `ZITADEL_ENV_VARS.md` (181 lines)
- **Content:** Environment variable reference
- **Status:** Outdated variable names
- **Replacement:** See [Configuration Reference](../../setup/ZITADEL_SETUP_GUIDE.md#configuration-reference) in master guide

### `ZITADEL_LOCAL_BOOTSTRAP_TEST.md` (293 lines)
- **Content:** Local testing guide with manual steps
- **Status:** Outdated - manual PAT creation
- **Replacement:** See [Quick Start](../../setup/ZITADEL_SETUP_GUIDE.md#quick-start-5-minutes-) in master guide

### `README-zitadel.md` (110 lines)
- **Content:** Old local development setup
- **Status:** Outdated configuration
- **Replacement:** See [Quick Start](../../setup/ZITADEL_SETUP_GUIDE.md#quick-start-5-minutes-) in master guide

## Current Documentation

**Primary Guide:**
- 📚 [Zitadel Setup Guide](../../setup/ZITADEL_SETUP_GUIDE.md) - Complete, authoritative reference

**Specialized Topics:**
- 🔐 [Zitadel Impersonation Setup](../../ZITADEL_IMPERSONATION_SETUP.md) - Token delegation
- 🎫 [Passport Zitadel Integration](../../PASSPORT_ZITADEL.md) - Authentication strategy
- 🔑 [Zitadel Access](../../setup/ZITADEL_ACCESS.md) - Access management

## Key Changes (November 2025)

### Old Approach (Archived)
```bash
# 1. Start Zitadel
docker compose up -d

# 2. Open browser, complete wizard
# 3. Login with admin user
# 4. Click profile → Personal Access Tokens
# 5. Create new token
# 6. Copy token to file
echo "dEnN..." > secrets/bootstrap/pat.txt

# 7. Run bootstrap
bash scripts/bootstrap-zitadel-fully-automated.sh provision
```

### New Approach (Current)
```bash
# 1. Start Zitadel (auto-generates PAT)
docker compose -f docker/docker-compose.yml up -d

# 2. Run bootstrap (uses auto-generated PAT)
bash scripts/bootstrap-zitadel-fully-automated.sh provision

# Done! Admin credentials displayed in output
```

## Migration Notes

If you're upgrading from the old approach:

1. **Don't delete** your existing secrets/PAT files
2. **Verify** the new machine-user config works
3. **Optional:** Can regenerate keys with new method
4. **Keep** old PAT as backup until verified

See the master guide for complete instructions.

---

**Questions?** See [Zitadel Setup Guide](../../setup/ZITADEL_SETUP_GUIDE.md) or create an issue.
