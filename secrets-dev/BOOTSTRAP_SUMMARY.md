# Remote Zitadel Bootstrap Summary

**Date:** Sat Nov 22 23:34:03 CET 2025
**Environment:** Development (dev.emergent-company.ai)

## Configuration

- **Zitadel URL:** http://zitadel.dev.emergent-company.ai:8100
- **Domain:** zitadel.dev.emergent-company.ai
- **Organization:** Spec Organization Dev
- **Organization ID:** 347883699234147332
- **Project:** Spec Server Dev
- **Project ID:** 347883699653577732

## Coolify Environment Variables

Add these to your Coolify deployment:

```bash
ZITADEL_DOMAIN=zitadel.dev.emergent-company.ai
ZITADEL_ORG_ID=347883699234147332
ZITADEL_PROJECT_ID=347883699653577732
```

## DNS Configuration

Configure wildcard DNS to enable domain access:

```
*.dev.emergent-company.ai  A  94.130.12.194
```

## Access

Once DNS is configured:

- **Zitadel Console:** https://zitadel.dev.emergent-company.ai
- **Database:** db.dev.emergent-company.ai:5432
- **API:** (configure after application deployment)

## Next Steps

1. Configure DNS records
2. Update Coolify environment variables
3. Create OAuth applications in Zitadel console
4. Deploy application services
5. Test authentication flow

## Credentials

**Admin Console Access:**
- Email: admin@dev.spec.local
- Password: DevAdmin123!

**Test User:**
- Email: test@dev.spec.local  
- Password: DevTest123!

(Note: Users need to be created manually in Zitadel console or via full bootstrap)
