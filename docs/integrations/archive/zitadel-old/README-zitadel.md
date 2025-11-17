# Local Zitadel (Dev)

This composes a local Zitadel + PostgreSQL for development.

## Services
- db (PostgreSQL with pgvector)
- zitadel (Zitadel API on :8080, Login v2 UI on :3000)

## Quick start
1. Review and adjust `docker/zitadel.env`. The master key must be 32 characters; password is dev-only.
2. Start services:
    - `docker compose -f docker/docker-compose.yml up -d db zitadel login`
3. Open Zitadel:
   - API/Console: http://localhost:8080
   - OIDC discovery: http://localhost:8080/.well-known/openid-configuration
   - Login v2 UI: http://localhost:3000/ui/v2/login
4. First admin user
   - Email: from `ZITADEL_FIRSTINSTANCE_ADMIN_EMAIL`
   - Username: from `ZITADEL_FIRSTINSTANCE_ADMIN_USERNAME`
   - Password: from `ZITADEL_ADMIN_PASSWORD`

## SPA/OIDC values (example)
- Issuer: http://localhost:8080
- Redirect URI: http://localhost:5175/auth/callback
- Post-logout redirect: http://localhost:5175/
- Client type: Public (PKCE), allow Google/GitHub IdPs when configured in Zitadel UI.

## Env vars (in `docker/zitadel.env`)
- ZITADEL_MASTERKEY: 32 chars (dev only)
- External access
   - ZITADEL_EXTERNALDOMAIN: localhost
   - ZITADEL_EXTERNALSECURE: false
   - ZITADEL_TLS_ENABLED: false
- PostgreSQL connection
   - ZITADEL_DATABASE_POSTGRES_HOST: db
   - ZITADEL_DATABASE_POSTGRES_PORT: 5432
   - ZITADEL_DATABASE_POSTGRES_DATABASE: zitadel
   - ZITADEL_DATABASE_POSTGRES_USER_USERNAME: zitadel
   - ZITADEL_DATABASE_POSTGRES_USER_PASSWORD: zitadel
   - ZITADEL_DATABASE_POSTGRES_USER_SSL_MODE: disable
- First instance / admin bootstrap
      - ZITADEL_FIRSTINSTANCE_ORG_NAME
      - ZITADEL_FIRSTINSTANCE_ADMIN_EMAIL
      - ZITADEL_FIRSTINSTANCE_ADMIN_USERNAME
   - ZITADEL_ADMIN_PASSWORD
- Login v2
   - ZITADEL_FIRSTINSTANCE_LOGINCLIENTPATPATH
   - ZITADEL_DEFAULTINSTANCE_FEATURES_LOGINV2_REQUIRED
   - ZITADEL_DEFAULTINSTANCE_FEATURES_LOGINV2_BASEURI
   - ZITADEL_OIDC_DEFAULTLOGINURLV2
    - ZITADEL_OIDC_DEFAULTLOGOUTURLV2

## Database users and roles

Postgres service `db` starts with a superuser named `spec` (password `spec`). On the very first run of this stack, the script `docker/init.sql` also tries to create:

- A runtime DB role: `zitadel` (password `zitadel`)
- A database: `zitadel` owned by the `zitadel` role

Important: `docker/init.sql` only runs when the Postgres data volume is empty. If you already started `db` before we added the script or you re-run the stack with the same volume, the role/database won’t be created automatically.

Zitadel uses two DB connections during startup:

- USER connection (runtime):
   - ZITADEL_DATABASE_POSTGRES_USER_USERNAME=zitadel
   - ZITADEL_DATABASE_POSTGRES_USER_PASSWORD=zitadel
   - ZITADEL_DATABASE_POSTGRES_USER_SSL_MODE=disable
   - ZITADEL_DATABASE_POSTGRES_DATABASE=zitadel
- ADMIN connection (initialization):
   - ZITADEL_DATABASE_POSTGRES_ADMIN_USERNAME=spec
   - ZITADEL_DATABASE_POSTGRES_ADMIN_PASSWORD=spec
   - ZITADEL_DATABASE_POSTGRES_ADMIN_SSL_MODE=disable
   - ZITADEL_DATABASE_POSTGRES_ADMIN_HOST=db
   - ZITADEL_DATABASE_POSTGRES_ADMIN_PORT=5432

In dev, we point the ADMIN credentials to the Postgres superuser (`spec`) so Zitadel can create/verify grants, schemas, and migrations. The USER credentials are the least-privileged runtime user (`zitadel`).

### If the `zitadel` role/database don’t exist

This happens when the Postgres volume already existed and `init.sql` didn’t run. You have two options:

1) Create them manually (non-destructive):

```bash
docker exec spec_pg psql -U spec -d postgres -c "CREATE ROLE zitadel LOGIN PASSWORD 'zitadel';" -c "CREATE DATABASE zitadel OWNER zitadel;" -c "GRANT CONNECT ON DATABASE postgres TO zitadel;" -c "GRANT CONNECT, CREATE, TEMP ON DATABASE zitadel TO zitadel;"
```

2) Reset the local DB (destructive: wipes Postgres data volume):

```bash
docker compose -f docker/docker-compose.yml down
docker volume rm docker_spec_pg_data
docker compose -f docker/docker-compose.yml up -d db zitadel login
```

### Common startup errors and fixes

- sslmode is invalid: Ensure `ZITADEL_DATABASE_POSTGRES_USER_SSL_MODE` and `ZITADEL_DATABASE_POSTGRES_ADMIN_SSL_MODE` are set (we set both to `disable` for dev).
- password authentication failed for user "zitadel": Create or reset the `zitadel` role/password as above, or wipe the volume so `init.sql` runs.
- permission denied to create role: Point ADMIN credentials to the Postgres superuser (`spec`/`spec`) in `docker/zitadel.env` so Zitadel can perform initialization.

## Master key

The master key must be exactly 32 characters. We store it in `docker/zitadel.env` as `ZITADEL_MASTERKEY` and start Zitadel with `--masterkeyFromEnv` so it reads the value from the container environment. Rotate this value only if you are willing to re-initialize keys (dev only).

## Notes
- This setup is for development only. See self-hosting guide for staging/prod: https://zitadel.com/docs/self-hosting/deploy/overview
- For provider login (Google/GitHub), configure external IdPs in Zitadel and set callback URLs accordingly.
- The PostgreSQL role and database named `zitadel` are created on first run by `docker/init.sql` if the volume is empty. Zitadel uses ADMIN (`spec`/`spec`) for initialization and USER (`zitadel`/`zitadel`) at runtime.
   - If the volume existed before, `init.sql` doesn’t run; either create the role/database manually or remove the volume as shown above.
