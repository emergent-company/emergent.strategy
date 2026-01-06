# Archived: Infisical Integration Documentation

These documents relate to the previous Infisical runtime integration which has been removed from the application code.

The application now uses standard `.env` and `.env.local` files for environment variables.

## What Changed

- **Removed**: Runtime Infisical loading from server and admin apps
- **Removed**: `infisical-loader.ts` and `vite-plugin-infisical.ts`
- **Removed**: Docker Infisical sidecar pattern
- **Kept**: Infisical utility scripts for secret management

## Scripts Still Available

Infisical utility scripts are still available for managing secrets in the Infisical vault:

```bash
# Dump secrets from Infisical to a local file
npm run secrets:dump                    # Writes to .env.infisical
npm run secrets:dump -- --output=.env.local  # Write directly to .env.local

# Push local secrets to Infisical
npm run migrate-secrets
npm run migrate-secrets:dry-run

# Audit for duplicate secrets
npm run audit-infisical-duplicates
```

## Workflow

1. Run `npm run secrets:dump` to fetch secrets from Infisical
2. Copy needed variables from `.env.infisical` to `.env.local`
3. Or use `npm run secrets:dump -- --output=.env.local` to write directly

## Required Environment Variables for Scripts

Set these in `.env.local` to use the Infisical scripts:

```
INFISICAL_SITE_URL=https://your-infisical-instance.com
INFISICAL_CLIENT_ID=your-client-id
INFISICAL_CLIENT_SECRET=your-client-secret
INFISICAL_PROJECT_ID=your-project-id
```
