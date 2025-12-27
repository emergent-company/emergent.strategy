# Database Logs Permission Fix

## Problem

Database container was failing to start with error:

```
FATAL: could not open log file "/logs/db.log": Permission denied
```

This happened because the old configuration used a bind mount (`../logs:/logs`) which:

- Doesn't work properly in Docker deployments (path context issues)
- Has permission problems (Postgres runs as non-root user)
- Requires manual directory creation with correct permissions

## Solution Applied

### Changes to `docker/docker-compose.yml`

1. **Replaced bind mount with named volume**:

   ```yaml
   # Before (problematic):
   - ../logs:/logs

   # After (fixed):
   - ${DB_LOGS_PATH:-db_logs}:/var/log/postgresql
   ```

2. **Updated log configuration**:

   - Changed log directory to standard Postgres location: `/var/log/postgresql`
   - Added proper log rotation: Daily rotation (`log_rotation_age=1d`)
   - Added date-based log filenames: `postgresql-%Y-%m-%d.log`
   - Made log level configurable: `${POSTGRES_LOG_STATEMENT:-none}`

3. **Added named volume**:
   ```yaml
   volumes:
     pg_data:
     db_logs: # New volume for logs
   ```

### New Environment Variables

Created `docker/.env.example` with:

```bash
# Database Logs Configuration
DB_LOGS_PATH=db_logs              # Use named volume (recommended for Docker deployments)
POSTGRES_LOG_STATEMENT=none       # Production default (no verbose logging)
```

## Configuration Options

### For Docker Deployment (Recommended)

The default uses a Docker named volume which is recommended for production.

**Before first deployment**, create the directory on the server:

```bash
ssh root@your-server "mkdir -p /home/emergent/db_logs && chmod 777 /home/emergent/db_logs"
```

Optional environment variables:

```bash
# DB_LOGS_PATH=/home/emergent/db_logs  # Or use default named volume
POSTGRES_LOG_STATEMENT=none            # Minimal logging for production
```

Optional environment variables in Coolify:

```bash
# DB_LOGS_PATH=/home/emergent/db_logs  # Already the default
POSTGRES_LOG_STATEMENT=none            # Minimal logging for production
```

### For Local Development

In `docker/.env`:

```bash
DB_LOGS_PATH=./logs               # Local directory for easy access
POSTGRES_LOG_STATEMENT=all        # Verbose logging for debugging
```

### For Advanced Setups

```bash
DB_LOGS_PATH=/var/log/postgresql  # Absolute path in container
POSTGRES_LOG_STATEMENT=mod        # Log only modifying statements
```

## Accessing Logs

### Method 1: Docker Logs Command (Recommended)

```bash
# View latest logs
docker logs $(docker ps -aqf "name=db") --tail=100

# Follow logs in real-time
docker logs -f $(docker ps -aqf "name=db")

# Search for errors
docker logs $(docker ps -aqf "name=db") 2>&1 | grep ERROR
```

### Method 2: Access Volume Directly

```bash
# List log files in volume
docker run --rm -v docker_db_logs:/logs alpine ls -la /logs

# Read a specific log file
docker run --rm -v docker_db_logs:/logs alpine cat /logs/postgresql-2025-11-22.log

# Copy logs to local machine
docker run --rm -v docker_db_logs:/logs -v $(pwd):/backup alpine \
  cp /logs/postgresql-2025-11-22.log /backup/
```

### Method 3: From Running Container

```bash
# Enter the database container
docker exec -it $(docker ps -aqf "name=db") bash

# Navigate to logs directory
cd /var/log/postgresql

# View logs
tail -f postgresql-2025-11-22.log
```

## Logging Levels Explained

- **`none`** (Production): No statement logging, minimal overhead
- **`ddl`**: Log DDL statements only (CREATE, ALTER, DROP)
- **`mod`**: Log all modifying statements (INSERT, UPDATE, DELETE)
- **`all`** (Development): Log all statements, very verbose

## Benefits

1. ✅ **No permission issues**: Volume managed by Docker
2. ✅ **Works in Docker deployments**: No path context problems
3. ✅ **Proper rotation**: Daily rotation prevents disk filling
4. ✅ **Configurable**: Easy to adjust logging level per environment
5. ✅ **Standard location**: Uses Postgres standard `/var/log/postgresql`
6. ✅ **Easy access**: Multiple methods to read logs

## Migration for Existing Deployments

### Preparation:

1. **Create logs directory on server** (one-time setup):

   ```bash
   ssh root@your-server "mkdir -p /home/emergent/db_logs && chmod 777 /home/emergent/db_logs"
   ```

2. **In deployment UI** (optional - uses default if not set):

   - `POSTGRES_LOG_STATEMENT=none`

3. **Redeploy** to apply changes

4. **Verify logs working**:
   ```bash
   ssh root@your-server
   docker logs $(docker ps -aqf "name=db") --tail=50
   ```

### No data loss:

The `pg_data` volume (actual database data) is unchanged. Only the logging configuration is updated.

## Troubleshooting

### Still getting permission errors?

```bash
# Check volume exists
docker volume ls | grep logs

# Check volume permissions
docker run --rm -v docker_db_logs:/logs alpine ls -la /logs

# Recreate volume if needed
docker compose down
docker volume rm docker_db_logs
docker compose up -d
```

### Want to preserve old logs?

If you had logs in `../logs` before:

```bash
# Copy old logs before switching
cp -r logs/ logs.backup/

# After new setup, the old logs remain in logs.backup/
```

## Related Files

- `docker/docker-compose.yml` - Updated configuration
- `docker/.env.example` - Environment variable documentation
- `COOLIFY_DEV_DEPLOYMENT_CHECK.md` - Updated deployment guide
