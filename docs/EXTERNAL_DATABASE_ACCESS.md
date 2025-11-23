# External Database Access Configuration

## Overview
The PostgreSQL database is now accessible from outside the server via port 5432.

## Current Status
✅ PostgreSQL port 5432 is exposed on host (0.0.0.0:5432)
✅ Port is accessible from external networks
✅ Database container is healthy and running
⏳ DNS record for db.dev.emergent-company.ai needs to be configured

## Configuration

### Docker Compose
The database service in `/data/coolify/applications/nw0wokswsooooo4g0c0ggok4/docker-compose.yaml` has:

```yaml
services:
  db:
    ports:
      - ${POSTGRES_PORT:-5432}:5432
```

This maps the container's PostgreSQL port 5432 to the host's port 5432 on all interfaces.

### Server Verification
```bash
# Port listening verification
netstat -tlnp | grep :5432
# Output: tcp 0 0 0.0.0.0:5432 0.0.0.0:* LISTEN 2373743/docker-prox

# Connection test from outside
nc -zv 94.130.12.194 5432
# Output: Connection to 94.130.12.194 5432 port [tcp/postgresql] succeeded!
```

## DNS Configuration Required

### Option 1: Wildcard DNS (Recommended)
Configure a wildcard A record for `*.dev.emergent-company.ai`:
```
*.dev.emergent-company.ai.  3600  IN  A  94.130.12.194
```

This will make ALL subdomains (including db.dev.emergent-company.ai) automatically resolve to the server.

### Option 2: Specific A Record
Configure a specific A record for the database:
```
db.dev.emergent-company.ai.  3600  IN  A  94.130.12.194
```

## Connection Instructions

### Once DNS is configured:
```bash
# Connection string
psql -h db.dev.emergent-company.ai -p 5432 -U spec -d spec

# Or using connection URI
postgresql://spec:<password>@db.dev.emergent-company.ai:5432/spec
```

### Current (using IP directly):
```bash
# Connection string
psql -h 94.130.12.194 -p 5432 -U spec -d spec

# Or using connection URI
postgresql://spec:<password>@94.130.12.194:5432/spec
```

## Database Credentials
- Host: `db.dev.emergent-company.ai` (once DNS is configured) or `94.130.12.194`
- Port: `5432`
- Database: `spec`
- Users:
  - Admin: `spec` (full permissions)
  - Zitadel: `zitadel` (limited to Zitadel schema)

Passwords are stored in `/data/coolify/applications/nw0wokswsooooo4g0c0ggok4/.env`

## Security Considerations

### Current State
- PostgreSQL is accessible from ANY IP address on the internet
- Only password authentication is protecting the database
- No IP allowlist or firewall rules in place

### Recommendations
1. **Configure Firewall**: Restrict access to specific IP addresses:
   ```bash
   # Example: Allow only your office IP
   ufw allow from <your-ip> to any port 5432
   ufw deny 5432
   ```

2. **SSL/TLS**: Enable SSL connections in PostgreSQL:
   ```yaml
   # In docker-compose.yaml
   command: postgres -c ssl=on -c ssl_cert_file=/etc/ssl/certs/server.crt
   ```

3. **VPN/Bastion**: Consider requiring VPN access or using a bastion host

4. **Connection Pooling**: Use a connection pooler (PgBouncer) for better security and performance

## Testing Checklist

- [x] Port 5432 exposed on host (0.0.0.0:5432)
- [x] Port accessible from external networks
- [x] Database container healthy
- [ ] DNS record configured for db.dev.emergent-company.ai
- [ ] Connection test using domain name
- [ ] Firewall rules configured (if needed)
- [ ] SSL/TLS enabled (recommended)

## Troubleshooting

### DNS Not Resolving
```bash
# Test DNS resolution
nslookup db.dev.emergent-company.ai

# Test with direct IP
psql -h 94.130.12.194 -p 5432 -U spec -d spec
```

### Connection Refused
```bash
# Check if port is listening on server
ssh root@94.130.12.194 "netstat -tlnp | grep :5432"

# Test port from outside
nc -zv 94.130.12.194 5432
```

### Authentication Failed
```bash
# Verify credentials in .env file
ssh root@94.130.12.194 "cd /data/coolify/applications/nw0wokswsooooo4g0c0ggok4 && grep POSTGRES_ .env"
```

### Container Not Running
```bash
# Check container status
ssh root@94.130.12.194 "cd /data/coolify/applications/nw0wokswsooooo4g0c0ggok4 && docker compose ps db"

# View logs
ssh root@94.130.12.194 "cd /data/coolify/applications/nw0wokswsooooo4g0c0ggok4 && docker compose logs db"
```

## Related Documentation
- [DB_LOGS_FIX.md](./DB_LOGS_FIX.md) - Database logging configuration
- [COOLIFY_DEV_DEPLOYMENT_CHECK.md](../COOLIFY_DEV_DEPLOYMENT_CHECK.md) - General deployment verification
