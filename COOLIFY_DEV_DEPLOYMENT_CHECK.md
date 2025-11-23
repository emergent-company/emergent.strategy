# Coolify Dev Deployment Diagnostic Guide

## Quick Checklist

### 1. SSH into Coolify Host
```bash
ssh root@kucharz.net
```

### 2. Run Diagnostic Script
```bash
# Copy the script to the server first
# From your local machine:
scp scripts/check-coolify-deployment.sh root@kucharz.net:/tmp/

# Then on the server:
bash /tmp/check-coolify-deployment.sh > deployment-check-$(date +%Y%m%d-%H%M%S).txt
```

### 3. Key Things to Check in Output

#### Database (db)
- ✅ Status should be "healthy"
- ✅ Both `pg_isready` checks should pass (spec and zitadel databases)
- ❌ Look for errors like "password authentication failed"
- ❌ Look for "database does not exist" errors

#### Zitadel
- ✅ Status should be "healthy"
- ❌ Common errors to watch for:
  - `ZITADEL_MASTERKEY` must be exactly 32 characters
  - `password authentication failed for user "zitadel"`
  - `database "zitadel" does not exist`
  - `sslmode is invalid`

#### Login UI
- ✅ Should be running (health checks optional)
- ❌ Connection errors to Zitadel API

### 4. Common Issues & Quick Fixes

#### Issue: Database logs permission denied
```bash
# Error: "could not open log file "/logs/db.log": Permission denied"
# 
# This happens when the logs directory doesn't exist or has wrong permissions.
# The fix is already in docker-compose.yml using /home/emergent/db_logs
#
# In Coolify UI, either leave DB_LOGS_PATH unset (uses default) or set to:
DB_LOGS_PATH=/home/emergent/db_logs

# Create the directory on the server if it doesn't exist:
ssh root@kucharz.net "mkdir -p /home/emergent/db_logs && chmod 777 /home/emergent/db_logs"

# If you need to access logs, use docker logs command:
docker logs $(docker ps -aqf "name=db") --tail=100

# Or access the volume directly:
docker run --rm -v docker_db_logs:/logs alpine ls -la /logs
```

#### Issue: ZITADEL_MASTERKEY too short/long
```bash
# Check current key length
docker exec $(docker ps -aqf "name=zitadel") printenv ZITADEL_MASTERKEY | wc -c

# If wrong, you need to set it in Coolify UI:
# - Go to Environment Variables
# - Set ZITADEL_MASTERKEY to exactly 32 characters
# Example: MasterkeyNeedsToHave32Characters
```

#### Issue: Zitadel can't connect to database
```bash
# Check if zitadel database exists
docker exec $(docker ps -aqf "name=db") psql -U spec -d postgres -c "\l" | grep zitadel

# If missing, create it:
docker exec $(docker ps -aqf "name=db") psql -U spec -d postgres -c "CREATE DATABASE zitadel;"
docker exec $(docker ps -aqf "name=db") psql -U spec -d postgres -c "CREATE USER zitadel WITH PASSWORD 'zitadel';"
docker exec $(docker ps -aqf "name=db") psql -U spec -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE zitadel TO zitadel;"
```

#### Issue: Password authentication failed
```bash
# Reset zitadel user password
docker exec $(docker ps -aqf "name=db") psql -U spec -d postgres -c "ALTER USER zitadel WITH PASSWORD 'zitadel';"

# Make sure ZITADEL_DB_PASSWORD is set in Coolify UI to match
```

#### Issue: Containers keep restarting
```bash
# Check restart count
docker ps -a --format "{{.Names}}: {{.Status}}"

# View full logs for problematic container
docker logs $(docker ps -aqf "name=zitadel") --tail=200
```

### 5. Verify Endpoints (from your local machine)

```bash
# Check if database port is accessible (should NOT be - internal only)
nc -zv kucharz.net 5432

# Check if Zitadel is accessible (configure port in Coolify)
# Default dev setup uses port 8100
curl -I http://kucharz.net:8100/.well-known/openid-configuration

# Or if SSL is configured
curl -I https://auth.kucharz.net/.well-known/openid-configuration
```

### 6. Check Coolify Configuration

In Coolify UI, verify:

1. **Resource Type**: Should be "Docker Compose"
2. **Docker Compose Location**: Should point to `docker/docker-compose.yml`
3. **Git Branch**: Should be `master` (or your deployment branch)
4. **Environment Variables** - Critical ones:
   - `POSTGRES_PASSWORD` (set)
   - `ZITADEL_DB_PASSWORD=zitadel` (or your chosen password)
   - `ZITADEL_MASTERKEY` (exactly 32 characters)
   - `ZITADEL_EXTERNALDOMAIN` (your domain, e.g., auth.kucharz.net)
   - `ZITADEL_EXTERNALSECURE=true` (if using HTTPS)
   - `ZITADEL_TLS_ENABLED=false` (usually false if behind Coolify's proxy)

### 7. Key Environment Variables to Set in Coolify

Based on `docker/.env.example` template:

```bash
# Required - Database
POSTGRES_PASSWORD=<strong-password>
ZITADEL_DB_PASSWORD=zitadel

# Optional - Database Logs (defaults to /home/emergent/db_logs)
# DB_LOGS_PATH=/home/emergent/db_logs
POSTGRES_LOG_STATEMENT=none

# Required - Zitadel Master Key (exactly 32 chars)
ZITADEL_MASTERKEY=MasterkeyNeedsToHave32Characters

# Required - External Access
ZITADEL_EXTERNALDOMAIN=auth.kucharz.net
ZITADEL_EXTERNALSECURE=true
ZITADEL_TLS_ENABLED=false

# Optional - First Admin User
ZITADEL_ADMIN_PASSWORD=<choose-secure-password>
```

### 8. Viewing Logs in Coolify

**Option A: Through Coolify UI**
- Navigate to your application
- Click "Logs" tab
- Select service (db, zitadel, login)
- View real-time or historical logs

**Option B: Via SSH**
```bash
# Real-time logs
docker logs -f $(docker ps -aqf "name=zitadel")

# Last 100 lines with timestamps
docker logs --tail=100 --timestamps $(docker ps -aqf "name=zitadel")

# Search for errors
docker logs $(docker ps -aqf "name=zitadel") 2>&1 | grep -i error
```

### 9. Emergency Recovery

If everything is broken:

```bash
# Stop all containers
docker compose -f docker/docker-compose.yml down

# Remove volumes (⚠️  DELETES ALL DATA)
docker compose -f docker/docker-compose.yml down -v

# Start fresh
docker compose -f docker/docker-compose.yml up -d

# Watch logs
docker compose -f docker/docker-compose.yml logs -f
```

### 10. Success Criteria

You should see:
- ✅ All containers status: "Up" and "healthy"
- ✅ Database accepting connections for both `spec` and `zitadel` users
- ✅ Zitadel responding to health checks
- ✅ No continuous restart loops
- ✅ Zitadel OIDC config accessible: `http://your-domain:8100/.well-known/openid-configuration`

## Troubleshooting Decision Tree

```
Container not starting?
├─ Check logs: docker logs <container>
├─ Check env vars: docker exec <container> env
└─ Check dependencies: Are db/zitadel healthy before dependent services?

Database connection failed?
├─ Verify password: ZITADEL_DB_PASSWORD matches database
├─ Check database exists: \l in psql
└─ Verify user exists: \du in psql

Zitadel specific errors?
├─ Masterkey: Must be exactly 32 chars
├─ SSL mode: Should be "disable" for internal docker network
├─ External domain: Should match your actual domain
└─ Init script: Check /docker-entrypoint-initdb.d/01-init-zitadel.sh ran

Containers healthy but service not accessible?
├─ Check port mappings in docker-compose.yml
├─ Check firewall rules on server
├─ Check Coolify proxy configuration
└─ Verify DNS points to correct server
```

## Additional Resources

- Docker Compose file: `docker/docker-compose.yml`
- Zitadel environment template: `docker/zitadel.env`
- Database init script: `docker/init.sql`
- Zitadel init script: `docker/01-init-zitadel.sh`
- Previous fixes: `COOLIFY_ENV_FIX.md`, `COOLIFY_DOCKER_COMPOSE_FIX.md`
