# Zitadel Access Guide

## Admin Console Access

After starting Zitadel with `npm run workspace:deps:start`, you can access the admin console at:

**URL:** http://localhost:8200/ui/console

### Default Admin Credentials

**Username:** `root@spec-inc.localhost`  
**Password:** `RootPassword1!`

> **Note:** The login name format is: `<username>@<org-name>.<external-domain>`
> - Username: `root` (from `ZITADEL_FIRSTINSTANCE_ORG_HUMAN_USERNAME`)
> - Org name: `Spec, Inc.` → converted to `spec-inc` (from `ZITADEL_FIRSTINSTANCE_ORG_NAME`)
> - External domain: `localhost` (from `ZITADEL_EXTERNALDOMAIN`)

## Configuration Source

The admin user is automatically created during Zitadel initialization using environment variables from:
- **File:** `docker/zitadel.env`
- **Loaded by:** `docker-compose.yml` via `env_file: - ./zitadel.env`

Key environment variables:
```bash
ZITADEL_FIRSTINSTANCE_ORG_NAME=Spec, Inc.
ZITADEL_FIRSTINSTANCE_ORG_HUMAN_USERNAME=root
ZITADEL_FIRSTINSTANCE_ORG_HUMAN_PASSWORD=RootPassword1!
ZITADEL_EXTERNALDOMAIN=localhost
```

## Port Configuration

- **Zitadel Console (HTTP):** Port 8200 (internal 8080)
- **Zitadel Login UI:** Port 8201 (internal 3000)

These ports are configured in `docker/.env`:
```bash
ZITADEL_HTTP_PORT=8200
ZITADEL_LOGIN_PORT=8201
```

## Verifying Login Names

If you need to check what login names exist in the database:

```bash
docker exec spec-2_pg psql -U zitadel -d zitadel -c "SELECT * FROM projections.login_names3;"
```

## OAuth Application Setup

Once logged into the admin console, you can create OAuth applications for your frontend:

1. Go to **Projects** → Create a new project (or use existing)
2. Click on the project → **Applications** → **New**
3. Select **User Agent** (for PKCE flow)
4. Configure redirect URIs:
   - `http://localhost:5176/auth/callback`
   - `http://localhost:5176/`
5. Copy the **Client ID** and update it in:
   - `apps/admin/.env.local` → `VITE_ZITADEL_CLIENT_ID`
   - `apps/admin/.env` → `VITE_ZITADEL_CLIENT_ID`

## Troubleshooting

### Can't log in

1. Verify the login name format in the database (see above)
2. Check that Zitadel is healthy: `docker ps --filter "name=spec-2_zitadel"`
3. Check Zitadel logs: `docker logs spec-2_zitadel`

### Password doesn't work

The password is set during first initialization. If you changed `ZITADEL_FIRSTINSTANCE_ORG_HUMAN_PASSWORD` after the first run, you need to:

1. Stop services: `npm run workspace:deps:stop`
2. Drop the Zitadel database:
   ```bash
   docker exec spec-2_pg psql -U spec -d postgres -c "DROP DATABASE IF EXISTS zitadel;"
   docker exec spec-2_pg psql -U spec -d postgres -c "CREATE DATABASE zitadel OWNER zitadel;"
   ```
3. Restart: `npm run workspace:deps:start`

## Reference

- [Zitadel Self-Hosting Documentation](https://zitadel.com/docs/self-hosting/deploy/compose)
- [Zitadel Configuration Options](https://zitadel.com/docs/self-hosting/manage/configure)
