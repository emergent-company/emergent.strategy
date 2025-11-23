# External Database Connection Guide

## Connection Details

### PostgreSQL Database
- **Host**: `94.130.12.194` or `db.dev.emergent-company.ai`
- **Port**: `5432`
- **Username**: `spec`
- **Password**: `spec`
- **Database**: `zitadel` (main database)
- **SSL**: Not required (internal network)

## Connection Methods

### 1. psql (Command Line)
```bash
PGPASSWORD=spec psql -h 94.130.12.194 -U spec -d zitadel
```

Or using the domain:
```bash
PGPASSWORD=spec psql -h db.dev.emergent-company.ai -U spec -d zitadel
```

### 2. Connection String
```
postgresql://spec:spec@94.130.12.194:5432/zitadel
```

Or with domain:
```
postgresql://spec:spec@db.dev.emergent-company.ai:5432/zitadel
```

### 3. GUI Tools (DBeaver, pgAdmin, DataGrip, etc.)
- **Host**: `94.130.12.194`
- **Port**: `5432`
- **Database**: `zitadel`
- **Username**: `spec`
- **Password**: `spec`
- **SSL Mode**: Disable

### 4. From Docker Containers
If connecting from another Docker container on the same server:
```bash
postgresql://spec:spec@db:5432/zitadel
```

## Firewall Configuration

The following ports are open in UFW:
- **5432/tcp**: PostgreSQL
- **8100/tcp**: Zitadel API
- **443/tcp**: HTTPS (for future)
- **80/tcp**: HTTP (for future)

To verify firewall rules:
```bash
ssh root@94.130.12.194 'ufw status | grep -E "(5432|8100)"'
```

## Database Schemas

The Zitadel database contains multiple schemas:

1. **Zitadel schemas**: 
   - `auth.*` - Authentication tables
   - `projections.*` - Zitadel projection tables
   - `eventstore.*` - Event sourcing tables
   - `system.*` - System tables

2. **Application schemas** (when app is deployed):
   - `kb.*` - Knowledge base tables
   - `core.*` - Core application tables

## Testing Connection

### Quick Connection Test
```bash
PGPASSWORD=spec psql -h 94.130.12.194 -U spec -d zitadel -c "SELECT version();"
```

### List All Schemas
```bash
PGPASSWORD=spec psql -h 94.130.12.194 -U spec -d zitadel -c "\dn+"
```

### List Tables in Schema
```bash
PGPASSWORD=spec psql -h 94.130.12.194 -U spec -d zitadel -c "\dt eventstore.*"
```

## Security Notes

⚠️ **Important Security Considerations**:

1. **Change Default Password**: The default password `spec` should be changed in production
2. **SSL/TLS**: Consider enabling SSL for production deployments
3. **IP Whitelist**: Consider restricting database access to specific IPs
4. **VPN/Tunnel**: For production, use VPN or SSH tunnel instead of direct exposure

### Changing the Password (Production)

1. Update password in database:
```sql
ALTER USER spec WITH PASSWORD 'your-secure-password';
```

2. Update password in Docker environment:
```bash
ssh root@94.130.12.194 'cd /data/coolify/applications/nw0wokswsooooo4g0c0ggok4 && nano .env'
# Update POSTGRES_PASSWORD=your-secure-password
```

3. Restart services:
```bash
ssh root@94.130.12.194 'cd /data/coolify/applications/nw0wokswsooooo4g0c0ggok4 && docker compose restart'
```

## SSH Tunnel (More Secure Alternative)

Instead of direct exposure, you can use SSH tunneling:

```bash
# Create SSH tunnel
ssh -L 5432:localhost:5432 root@94.130.12.194

# Then connect via localhost
PGPASSWORD=spec psql -h localhost -U spec -d zitadel
```

This way, you don't need to expose port 5432 publicly.

## Backup and Restore

### Create Backup
```bash
ssh root@94.130.12.194 'docker exec db-nw0wokswsooooo4g0c0ggok4-212327147296 pg_dump -U spec zitadel' > backup-$(date +%Y%m%d-%H%M%S).sql
```

### Restore Backup
```bash
cat backup-20251122-120000.sql | ssh root@94.130.12.194 'docker exec -i db-nw0wokswsooooo4g0c0ggok4-212327147296 psql -U spec -d zitadel'
```

## Connection from Application

When deploying your Spec Server application, use this connection string in Coolify environment:

```bash
DATABASE_URL=postgresql://spec:spec@db:5432/zitadel
```

Note: Use `db` hostname (not IP) when connecting from containers on the same Docker network.

---

**Last Updated**: November 22, 2025
**Environment**: dev.emergent-company.ai
