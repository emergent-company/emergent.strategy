# MCP Chat Integration - Configuration Guide

## Overview

This guide covers configuration, deployment, and administration of the MCP (Model Context Protocol) chat integration.

**Audience**: DevOps engineers, system administrators, backend developers  
**Version**: 1.0  
**Last Updated**: October 21, 2025

---

## Environment Variables

### Required Configuration

```bash
# Vertex AI (LLM Provider) - REQUIRED
VERTEX_AI_PROJECT_ID=your-gcp-project-id
VERTEX_AI_LOCATION=us-central1
VERTEX_AI_MODEL=gemini-1.5-flash-002

# Database Connection - REQUIRED
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
```

### MCP-Specific Configuration

```bash
# MCP Server URL (default: http://localhost:3001)
# Internal MCP server endpoint - should not be exposed externally
MCP_SERVER_URL=http://localhost:3001

# Enable/Disable MCP Integration (default: 1)
# Set to 0 to disable MCP tools in chat
CHAT_ENABLE_MCP=1

# MCP Request Timeout (default: 30000ms)
# How long to wait for MCP tool execution before giving up
MCP_TIMEOUT=30000

# MCP Client Retry Settings (optional)
MCP_RETRY_ATTEMPTS=2
MCP_RETRY_DELAY=1000
```

### Optional Performance Tuning

```bash
# Cache TTL for schema queries (not yet implemented)
MCP_CACHE_TTL=300000  # 5 minutes in milliseconds

# Tool detection confidence threshold (default: 0.7)
# Lower = more aggressive detection, higher = more conservative
MCP_DETECTION_THRESHOLD=0.7
```

---

## Deployment Scenarios

### Scenario 1: Single Server (Development)

**Architecture**:
```
┌──────────────────────────────────────┐
│  Single Node                          │
│                                       │
│  ┌────────────┐  ┌─────────────┐   │
│  │  NestJS    │  │  PostgreSQL  │   │
│  │  API       │←─┤  Database    │   │
│  │  Port 3001 │  │  Port 5432   │   │
│  └────────────┘  └─────────────┘   │
│       ↑                               │
│       │ Internal HTTP                 │
│       ↓                               │
│  ┌────────────┐                      │
│  │  MCP       │                      │
│  │  Server    │                      │
│  │  /mcp/rpc  │                      │
│  └────────────┘                      │
└──────────────────────────────────────┘
```

**Configuration**:
```bash
MCP_SERVER_URL=http://localhost:3001
CHAT_ENABLE_MCP=1
```

**Use Case**: Local development, testing

---

### Scenario 2: Production (Kubernetes)

**Architecture**:
```
┌─────────────────────────────────────────────────────┐
│  Kubernetes Cluster                                  │
│                                                       │
│  ┌──────────────┐       ┌──────────────┐           │
│  │  API Pod 1   │       │  API Pod 2   │           │
│  │  (NestJS)    │       │  (NestJS)    │           │
│  └──────┬───────┘       └──────┬───────┘           │
│         │                       │                    │
│         └───────────┬───────────┘                    │
│                     │                                │
│                     ↓                                │
│            ┌─────────────────┐                      │
│            │  MCP Service    │                      │
│            │  (Internal)     │                      │
│            └────────┬────────┘                      │
│                     │                                │
│                     ↓                                │
│            ┌─────────────────┐                      │
│            │  PostgreSQL     │                      │
│            │  (Managed)      │                      │
│            └─────────────────┘                      │
└─────────────────────────────────────────────────────┘
```

**Configuration**:
```yaml
# Kubernetes ConfigMap
apiVersion: v1
kind: ConfigMap
metadata:
  name: api-config
data:
  MCP_SERVER_URL: "http://mcp-service:3001"
  CHAT_ENABLE_MCP: "1"
  MCP_TIMEOUT: "30000"
  VERTEX_AI_PROJECT_ID: "your-project"
  VERTEX_AI_LOCATION: "us-central1"
  VERTEX_AI_MODEL: "gemini-1.5-flash-002"
```

**Service Definition**:
```yaml
apiVersion: v1
kind: Service
metadata:
  name: mcp-service
spec:
  type: ClusterIP  # Internal only
  ports:
    - port: 3001
      targetPort: 3001
  selector:
    app: api-server
```

**Use Case**: Production deployment with horizontal scaling

---

### Scenario 3: Microservices (Separate MCP Server)

**Architecture**:
```
┌──────────────────────────────────────────────────┐
│  API Tier                                         │
│  ┌────────┐  ┌────────┐  ┌────────┐            │
│  │ API 1  │  │ API 2  │  │ API 3  │            │
│  └───┬────┘  └───┬────┘  └───┬────┘            │
│      │           │            │                  │
│      └───────────┼────────────┘                  │
│                  │ HTTP                          │
└──────────────────┼────────────────────────────────┘
                   ↓
┌──────────────────────────────────────────────────┐
│  MCP Service (Separate Deployment)                │
│  ┌──────────────────────────────────┐           │
│  │  MCP Server                       │           │
│  │  - Schema version tool            │           │
│  │  - Changelog tool                 │           │
│  │  - Type info tool                 │           │
│  └──────────────┬───────────────────┘           │
│                 │                                │
│                 ↓                                │
│        ┌─────────────────┐                      │
│        │  PostgreSQL      │                      │
│        │  (Read Replica)  │                      │
│        └─────────────────┘                      │
└──────────────────────────────────────────────────┘
```

**Configuration**:
```bash
# API Server
MCP_SERVER_URL=http://mcp-service.internal:8080
CHAT_ENABLE_MCP=1

# MCP Server (separate deployment)
DATABASE_URL=postgresql://readonly:pass@replica:5432/db
PORT=8080
```

**Benefits**:
- Independent scaling of MCP service
- Read replica for reduced load on primary DB
- Easier to disable/update MCP without affecting main API

**Use Case**: High-traffic production, microservices architecture

---

## Feature Flags

### CHAT_ENABLE_MCP

**Purpose**: Master switch for MCP integration

**Values**:
- `1` (default): MCP integration enabled
- `0`: MCP integration disabled, chat works without schema queries

**When to Disable**:
- Testing LLM responses without context
- Troubleshooting MCP issues
- Maintenance on MCP server
- Performance testing of chat without MCP overhead

**Example**:
```bash
# Temporarily disable for testing
CHAT_ENABLE_MCP=0 npm run start

# Permanently disable in environment
echo "CHAT_ENABLE_MCP=0" >> .env
```

---

## Database Configuration

### Required Permissions

The MCP server needs **READ-ONLY** access to these tables:

```sql
-- Schema metadata tables
GRANT SELECT ON kb.schema_versions TO mcp_user;
GRANT SELECT ON kb.schema_changes TO mcp_user;
GRANT SELECT ON kb.type_registry TO mcp_user;
GRANT SELECT ON kb.property_registry TO mcp_user;
GRANT SELECT ON kb.relationship_registry TO mcp_user;
```

### Read Replica Setup (Recommended for Production)

```sql
-- Create read-only user
CREATE USER mcp_readonly WITH PASSWORD 'secure_password';

-- Grant read access
GRANT CONNECT ON DATABASE knowledge_base TO mcp_readonly;
GRANT USAGE ON SCHEMA kb TO mcp_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA kb TO mcp_readonly;

-- Ensure future tables are also readable
ALTER DEFAULT PRIVILEGES IN SCHEMA kb GRANT SELECT ON TABLES TO mcp_readonly;
```

**Connection String**:
```bash
MCP_DATABASE_URL=postgresql://mcp_readonly:secure_password@replica-host:5432/knowledge_base
```

---

## Monitoring & Alerts

### Metrics to Monitor

#### Application Metrics

```typescript
// Example Prometheus metrics (to be implemented)

// MCP tool call rate
mcp_tool_calls_total{tool="schema_version", status="success"} 1234

// MCP tool latency
mcp_tool_duration_seconds{tool="schema_version"} 0.102

// MCP detection accuracy
mcp_detection_result{should_use_mcp="true", confidence="high"} 567

// Error rates
mcp_errors_total{tool="schema_version", error_type="timeout"} 12
```

#### Infrastructure Metrics

- **API Server**:
  - CPU usage
  - Memory usage
  - Request rate
  - Response times

- **MCP Server** (if separate):
  - CPU usage
  - Memory usage
  - Connection pool size
  - Query execution time

- **Database**:
  - Query performance for schema tables
  - Connection count
  - Read replica lag (if applicable)

### Recommended Alerts

```yaml
# Example Alertmanager rules

groups:
  - name: mcp_alerts
    rules:
      # High error rate
      - alert: MCPHighErrorRate
        expr: rate(mcp_errors_total[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High MCP error rate detected"
          description: "MCP error rate is {{ $value }} errors/sec"

      # Slow tool execution
      - alert: MCPSlowExecution
        expr: mcp_tool_duration_seconds{quantile="0.95"} > 5
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "MCP tool execution is slow"
          description: "95th percentile is {{ $value }}s"

      # MCP server down
      - alert: MCPServerDown
        expr: up{job="mcp-server"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "MCP server is down"
          description: "MCP server has been down for 2 minutes"
```

---

## Performance Tuning

### Connection Pooling

**NestJS (TypeORM)**:
```typescript
// database.config.ts
{
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  poolSize: 20,  // Increase for high traffic
  maxQueryExecutionTime: 5000,  // Log slow queries
}
```

### Query Optimization

**Schema Version Query** (already optimized):
```sql
SELECT version, effective_date, created_at
FROM kb.schema_versions
ORDER BY effective_date DESC
LIMIT 1;

-- Add index (should already exist)
CREATE INDEX idx_schema_versions_date 
ON kb.schema_versions(effective_date DESC);
```

**Changelog Query** (with date filter):
```sql
SELECT version, change_date, description, type_affected
FROM kb.schema_changes
WHERE change_date >= $1
ORDER BY change_date DESC
LIMIT $2;

-- Add index for date range queries
CREATE INDEX idx_schema_changes_date 
ON kb.schema_changes(change_date DESC);
```

### Caching Strategy (Future Enhancement)

```typescript
// Example Redis caching (not yet implemented)

// Cache schema version (TTL: 5 minutes)
const cacheKey = 'schema:version:current';
let version = await redis.get(cacheKey);
if (!version) {
  version = await queryDatabase();
  await redis.setex(cacheKey, 300, JSON.stringify(version));
}

// Cache type info (TTL: 10 minutes)
const typeKey = `schema:type:${typeName}`;
let typeInfo = await redis.get(typeKey);
if (!typeInfo) {
  typeInfo = await queryTypeInfo(typeName);
  await redis.setex(typeKey, 600, JSON.stringify(typeInfo));
}
```

---

## Security Best Practices

### 1. Network Isolation

✅ **DO**:
- Keep MCP server internal (no external access)
- Use private network or VPN for API ↔ MCP communication
- Firewall rules blocking external access to MCP port

❌ **DON'T**:
- Expose MCP server to public internet
- Use unencrypted HTTP in production

### 2. Authentication

**API Layer**:
```typescript
// Chat endpoint requires JWT
@UseGuards(JwtAuthGuard)
@Post('stream')
async streamPost(@Req() req, @Body() dto: ChatStreamDto) {
  // MCP calls are internal - no additional auth needed
}
```

**MCP Server** (internal):
```typescript
// No authentication needed - internal only
// Network isolation provides security
```

### 3. Rate Limiting

```typescript
// Example rate limit (not yet implemented)
import { ThrottlerGuard } from '@nestjs/throttler';

@UseGuards(ThrottlerGuard)
@Throttle(60, 60)  // 60 requests per 60 seconds
@Post('stream')
async streamPost(...) { }
```

### 4. Input Validation

```typescript
// Already implemented
class ChatStreamDto {
  @IsString()
  @IsNotEmpty()
  message: string;

  @IsString()
  @IsOptional()
  conversationId?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(50)
  topK?: number;
}
```

---

## Backup & Disaster Recovery

### Database Backup

**Schema tables to include**:
```bash
# PostgreSQL dump of schema tables
pg_dump -h localhost -U postgres -d knowledge_base \
  -t kb.schema_versions \
  -t kb.schema_changes \
  -t kb.type_registry \
  -t kb.property_registry \
  -t kb.relationship_registry \
  > schema_backup_$(date +%Y%m%d).sql
```

### Recovery Scenarios

**Scenario 1: MCP Server Crash**
- **Impact**: Schema queries fail, chat continues without context
- **Recovery**: Restart MCP server (automatic with Kubernetes)
- **Downtime**: 0 (graceful degradation)

**Scenario 2: Database Connection Loss**
- **Impact**: MCP tools return errors
- **Recovery**: Restore database connection
- **Downtime**: 0 (chat continues, MCP retries)

**Scenario 3: Corrupted Schema Data**
- **Impact**: Incorrect schema information returned
- **Recovery**: Restore from backup
- **Downtime**: 5-10 minutes (during restore)

---

## Troubleshooting

### Issue: MCP Tools Not Working

**Symptoms**:
- No "Querying..." indicator in UI
- Schema queries get generic responses
- Logs show "MCP disabled" or "Detection returned false"

**Diagnosis**:
```bash
# Check feature flag
echo $CHAT_ENABLE_MCP  # Should be 1

# Check MCP server health
curl http://localhost:3001/health

# Check logs for detection results
grep "MCP tool detected" logs/app.log

# Test MCP endpoint directly
curl -X POST http://localhost:3001/mcp/rpc \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

**Solutions**:
1. Enable MCP: `export CHAT_ENABLE_MCP=1`
2. Restart API server
3. Verify MCP server is running
4. Check database connectivity

---

### Issue: Slow Schema Queries

**Symptoms**:
- Long delay before response starts
- Timeout errors in logs
- Poor user experience

**Diagnosis**:
```sql
-- Check query performance
EXPLAIN ANALYZE
SELECT version, effective_date, created_at
FROM kb.schema_versions
ORDER BY effective_date DESC
LIMIT 1;

-- Check table size
SELECT pg_size_pretty(pg_total_relation_size('kb.schema_versions'));

-- Check for missing indexes
SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE tablename IN ('schema_versions', 'schema_changes', 'type_registry');
```

**Solutions**:
1. Add/rebuild indexes
2. Increase `MCP_TIMEOUT`
3. Optimize database queries
4. Consider caching (see Performance Tuning)

---

### Issue: High Memory Usage

**Symptoms**:
- API server OOM (Out of Memory) errors
- Pod restarts in Kubernetes
- Slow response times

**Diagnosis**:
```bash
# Check Node.js heap usage
curl http://localhost:3001/health/heap

# Monitor with PM2
pm2 monit

# Check for memory leaks
node --inspect apps/server-nest/src/main.ts
```

**Solutions**:
1. Increase memory limits (Kubernetes)
2. Implement connection pooling
3. Add result size limits to queries
4. Enable caching to reduce DB load

---

## Updating the System

### Adding New MCP Tools

1. **Define tool in MCP server**:
```typescript
// apps/server-nest/src/modules/mcp/mcp-server.ts
{
  name: 'relationship_search',
  description: 'Search for relationships between types',
  inputSchema: {
    type: 'object',
    properties: {
      source_type: { type: 'string' },
      target_type: { type: 'string' }
    }
  }
}
```

2. **Implement tool handler**:
```typescript
case 'relationship_search':
  return await this.handleRelationshipSearch(args);
```

3. **Update detector patterns**:
```typescript
// apps/server-nest/src/modules/mcp/mcp-tool-detector.service.ts
if (message.match(/relationship.*between/i)) {
  return {
    shouldUseMcp: true,
    suggestedTool: 'relationship_search',
    confidence: 0.85
  };
}
```

4. **Test end-to-end**:
```bash
npm run test:e2e -- --testNamePattern="relationship_search"
```

5. **Update documentation**:
- Add to MCP_CHAT_ARCHITECTURE.md
- Add examples to MCP_CHAT_USER_GUIDE.md

### Updating Detection Patterns

```typescript
// Increase coverage for existing tools
const schemaVersionPatterns = [
  /what.*version/i,
  /current.*schema/i,
  /schema.*version/i,
  /version.*schema/i,  // NEW
  /show.*version/i      // NEW
];
```

### Changing System Prompts

```typescript
// apps/server-nest/src/modules/chat/chat-generation.service.ts
private getSystemPromptForIntent(intent?: string): string {
  switch (intent) {
    case 'schema-version':
      return 'You are a helpful assistant. When provided schema version info, format it clearly...';
    // Update existing prompts or add new ones
  }
}
```

---

## Migration Guide

### From No MCP to MCP-Enabled

**Step 1: Verify Prerequisites**
```bash
# Check database schema
psql -d knowledge_base -c "\dt kb.schema_*"

# Verify required tables exist
- kb.schema_versions ✅
- kb.schema_changes ✅
- kb.type_registry ✅
```

**Step 2: Enable MCP**
```bash
# Add to .env
echo "CHAT_ENABLE_MCP=1" >> .env
echo "MCP_SERVER_URL=http://localhost:3001" >> .env
```

**Step 3: Deploy**
```bash
# Build and restart
npm run build
npm run start:prod
```

**Step 4: Verify**
```bash
# Test schema query
curl -X POST http://localhost:3001/chat/stream \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"What is the current schema version?"}'
```

**Step 5: Monitor**
```bash
# Check logs for MCP activity
tail -f logs/app.log | grep MCP
```

---

## Rollback Procedure

### Quick Rollback (Disable MCP)

```bash
# Method 1: Environment variable
export CHAT_ENABLE_MCP=0
pm2 restart all

# Method 2: Feature flag in database (future)
psql -d knowledge_base -c "UPDATE feature_flags SET enabled = false WHERE name = 'chat_mcp'"
```

### Full Rollback (Remove MCP Code)

```bash
# Revert to previous version
git revert <mcp-integration-commit>
git push origin master

# Rebuild and deploy
npm run build
kubectl rollout restart deployment/api-server
```

---

## Compliance & Auditing

### Data Access Logs

```typescript
// Log all MCP tool calls
this.logger.log({
  event: 'mcp_tool_call',
  tool: toolName,
  user_id: req.user.sub,
  timestamp: new Date().toISOString(),
  duration_ms: endTime - startTime
});
```

### Privacy Considerations

- ✅ No user data sent to MCP server
- ✅ Schema metadata only (non-PII)
- ✅ Conversation history stored with user ownership
- ✅ GDPR compliant (user can delete conversations)

---

## Summary

This configuration guide provides:

- ✅ Complete environment variable reference
- ✅ Multiple deployment scenarios
- ✅ Performance tuning recommendations
- ✅ Security best practices
- ✅ Monitoring and alerting setup
- ✅ Troubleshooting procedures
- ✅ Migration and rollback guides

For technical details, see [MCP_CHAT_ARCHITECTURE.md](./MCP_CHAT_ARCHITECTURE.md).  
For user documentation, see [MCP_CHAT_USER_GUIDE.md](./MCP_CHAT_USER_GUIDE.md).
