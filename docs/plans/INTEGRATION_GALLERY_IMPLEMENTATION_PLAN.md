# Integration Gallery & ClickUp Integration - Implementation Plan

**Status**: Ready for Implementation  
**Created**: 2025-10-05  
**Specifications**: docs/spec/22-clickup-integration.md, docs/spec/23-integration-gallery.md

---

## 1. Executive Summary

This document provides a detailed, actionable plan to implement:
1. **Integration Gallery**: A centralized UI for managing third-party integrations
2. **ClickUp Integration**: First integration implementation with full import and webhook sync

### Verification Against Specs

✅ **Spec 23 (Integration Gallery)**
- Grid layout with integration cards (logo, name, description, toggle, configure button)
- Configuration modal for settings (authentication, data mapping, sync settings)
- API endpoints: `GET /api/v1/integrations`, `GET/PUT /api/v1/integrations/{name}`
- Encrypted credential storage

✅ **Spec 22 (ClickUp Integration)**
- Plugin architecture with common interface
- Authentication: API tokens (OAuth 2.0 in Phase 2)
- Rate limiting: 100 requests/minute
- Data mapping: Workspace→Organization, Space→Project, Folder/List→Collection, Task→Task
- Full import process
- Webhook endpoint: `/webhooks/clickup`
- Event handling: taskCreated, taskUpdated, taskDeleted, listCreated, etc.

---

## 2. Architecture Overview

### 2.1 Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Plugin Architecture** | Use NestJS dynamic modules for extensibility; each integration is a separate module |
| **Credential Storage** | Encrypt with `pgcrypto` AES-256, store in `integrations` table |
| **Rate Limiting** | Custom token-bucket implementation in ClickUpService (ClickUp: 100 req/min) |
| **Background Jobs** | Leverage existing extraction job pattern for long-running imports |
| **Webhook Security** | Validate ClickUp webhook signatures using HMAC-SHA256 |
| **Scoping** | Integrations scoped to project level (align with existing org→project hierarchy) |
| **State Management** | Separate `clickup_sync_state` table for tracking cursors and last sync times |

### 2.2 System Components

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React)                      │
├─────────────────────────────────────────────────────────────┤
│  Integration Gallery Page                                    │
│  ├─ Integration Cards Grid                                   │
│  ├─ Configuration Modal                                      │
│  └─ ClickUp Config Form                                      │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend (NestJS)                          │
├─────────────────────────────────────────────────────────────┤
│  IntegrationsModule                                          │
│  ├─ IntegrationsController (/api/v1/integrations)           │
│  ├─ IntegrationsService (CRUD, encryption)                   │
│  ├─ IntegrationRegistry (plugin discovery)                   │
│  └─ BaseIntegration (abstract class)                         │
├─────────────────────────────────────────────────────────────┤
│  ClickUpModule                                               │
│  ├─ ClickUpService (API client, rate limiter)                │
│  ├─ ClickUpImporter (full import logic)                      │
│  ├─ ClickUpWebhookController (/webhooks/clickup)             │
│  └─ ClickUpMappingService (data transforms)                  │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Database (PostgreSQL)                      │
├─────────────────────────────────────────────────────────────┤
│  kb.integrations                                             │
│  kb.clickup_sync_state                                       │
│  kb.object_extraction_jobs (existing - reuse for imports)    │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Database Schema

### 3.1 Migration: `0003_integrations_system.sql`

```sql
-- ============================================================================
-- Integration Gallery & ClickUp Integration - Database Schema
-- ============================================================================

-- Integrations table: stores configuration for all integrations
CREATE TABLE IF NOT EXISTS kb.integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL, -- e.g., 'clickup', 'jira'
    display_name VARCHAR(255) NOT NULL, -- e.g., 'ClickUp'
    description TEXT,
    enabled BOOLEAN NOT NULL DEFAULT false,
    
    -- Scoping: integrations are project-specific
    org_id TEXT NOT NULL,
    project_id UUID NOT NULL,
    
    -- Encrypted settings (JSON with auth, data mapping, sync settings)
    -- Use pgcrypto for encryption/decryption
    settings_encrypted BYTEA,
    
    -- Metadata
    logo_url TEXT,
    webhook_secret TEXT, -- For validating webhook signatures
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    UNIQUE(name, project_id) -- One integration instance per project
);

CREATE INDEX IF NOT EXISTS idx_integrations_project ON kb.integrations(project_id);
CREATE INDEX IF NOT EXISTS idx_integrations_enabled ON kb.integrations(enabled);

-- ClickUp sync state: tracks synchronization progress
CREATE TABLE IF NOT EXISTS kb.clickup_sync_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id UUID NOT NULL REFERENCES kb.integrations(id) ON DELETE CASCADE,
    
    -- Track last sync times per entity type
    last_full_import_at TIMESTAMPTZ,
    last_workspace_sync_at TIMESTAMPTZ,
    last_space_sync_at TIMESTAMPTZ,
    last_folder_sync_at TIMESTAMPTZ,
    last_list_sync_at TIMESTAMPTZ,
    last_task_sync_at TIMESTAMPTZ,
    
    -- Sync cursors for incremental updates (if supported by API)
    sync_cursor TEXT,
    
    -- Import job tracking
    active_import_job_id UUID, -- References kb.object_extraction_jobs
    
    -- Statistics
    total_imported_objects INT DEFAULT 0,
    last_error TEXT,
    last_error_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clickup_sync_integration ON kb.clickup_sync_state(integration_id);

-- Update trigger for updated_at timestamps
CREATE OR REPLACE FUNCTION kb.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_integrations_updated_at ON kb.integrations;
CREATE TRIGGER trg_integrations_updated_at
    BEFORE UPDATE ON kb.integrations
    FOR EACH ROW EXECUTE FUNCTION kb.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_clickup_sync_state_updated_at ON kb.clickup_sync_state;
CREATE TRIGGER trg_clickup_sync_state_updated_at
    BEFORE UPDATE ON kb.clickup_sync_state
    FOR EACH ROW EXECUTE FUNCTION kb.update_updated_at_column();

-- Grant permissions (align with existing schema)
-- (Adjust based on actual DB users in production)
```

### 3.2 Encryption Approach

**Encryption at Rest:**
```typescript
// Using pgcrypto extension
const encryptQuery = `
  SELECT encode(encrypt($1::bytea, $2, 'aes'), 'base64')
`;
const decryptQuery = `
  SELECT convert_from(decrypt(decode($1, 'base64'), $2, 'aes'), 'utf-8')
`;
```

**Key Management:**
- Encryption key stored in environment variable: `INTEGRATION_ENCRYPTION_KEY`
- Key should be 32 bytes (256-bit AES)
- Production: Rotate keys periodically, use secrets manager (AWS Secrets Manager, etc.)

---

## 4. Backend Implementation

### 4.1 IntegrationsModule

#### File Structure
```
apps/server/src/modules/integrations/
├── integrations.module.ts
├── integrations.controller.ts
├── integrations.service.ts
├── integration.registry.ts
├── dto/
│   ├── integration.dto.ts
│   └── update-integration.dto.ts
├── interfaces/
│   └── base-integration.interface.ts
└── utils/
    └── encryption.util.ts
```

#### Core Interface: `base-integration.interface.ts`

```typescript
export interface IntegrationSettings {
  authentication: {
    method: 'apikey' | 'oauth';
    apiKey?: string;
    oauth?: {
      accessToken: string;
      refreshToken: string;
      expiresAt: string;
    };
  };
  dataMapping?: Record<string, any>;
  syncSettings?: {
    autoSync: boolean;
    syncInterval?: number; // minutes
  };
}

export abstract class BaseIntegration {
  abstract readonly name: string;
  abstract readonly displayName: string;
  abstract readonly description: string;
  abstract readonly logoUrl: string;

  abstract configure(settings: IntegrationSettings): Promise<void>;
  abstract testConnection(): Promise<boolean>;
  abstract runFullImport?(): Promise<string>; // Returns job ID
  abstract handleWebhook?(payload: any): Promise<void>;
}
```

#### Controller: `integrations.controller.ts`

```typescript
@ApiTags('Integrations')
@Controller('api/v1/integrations')
@UseGuards(AuthGuard, ScopesGuard)
export class IntegrationsController {
  constructor(
    private readonly integrationsService: IntegrationsService,
    private readonly integrationRegistry: IntegrationRegistry,
  ) {}

  @Get()
  @Scopes('integrations:read')
  @ApiOperation({ summary: 'List all available integrations' })
  async listIntegrations(
    @Query('project_id') projectId: string,
    @Query('org_id') orgId: string,
  ): Promise<IntegrationDto[]> {
    return this.integrationsService.listIntegrations(orgId, projectId);
  }

  @Get(':name')
  @Scopes('integrations:read')
  @ApiOperation({ summary: 'Get integration settings' })
  async getIntegration(
    @Param('name') name: string,
    @Query('project_id') projectId: string,
    @Query('org_id') orgId: string,
  ): Promise<IntegrationDto> {
    return this.integrationsService.getIntegration(name, orgId, projectId);
  }

  @Put(':name')
  @Scopes('integrations:write')
  @ApiOperation({ summary: 'Update integration settings' })
  async updateIntegration(
    @Param('name') name: string,
    @Query('project_id') projectId: string,
    @Query('org_id') orgId: string,
    @Body() dto: UpdateIntegrationDto,
  ): Promise<IntegrationDto> {
    return this.integrationsService.updateIntegration(name, orgId, projectId, dto);
  }

  @Post(':name/test')
  @Scopes('integrations:write')
  @ApiOperation({ summary: 'Test integration connection' })
  async testConnection(
    @Param('name') name: string,
    @Query('project_id') projectId: string,
    @Query('org_id') orgId: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.integrationsService.testConnection(name, orgId, projectId);
  }

  @Post(':name/import')
  @Scopes('integrations:write')
  @ApiOperation({ summary: 'Trigger full import' })
  async triggerImport(
    @Param('name') name: string,
    @Query('project_id') projectId: string,
    @Query('org_id') orgId: string,
  ): Promise<{ jobId: string }> {
    const jobId = await this.integrationsService.triggerImport(name, orgId, projectId);
    return { jobId };
  }
}
```

#### Service: `integrations.service.ts`

```typescript
@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly encryptionUtil: EncryptionUtil,
    private readonly integrationRegistry: IntegrationRegistry,
  ) {}

  async listIntegrations(orgId: string, projectId: string): Promise<IntegrationDto[]> {
    // Get all registered integrations
    const registeredIntegrations = this.integrationRegistry.getAll();
    
    // Fetch their status from DB
    const result = await this.db.query(
      `SELECT name, display_name, description, enabled, logo_url, created_at, updated_at
       FROM kb.integrations
       WHERE org_id = $1 AND project_id = $2`,
      [orgId, projectId]
    );

    const dbIntegrations = new Map(result.rows.map(row => [row.name, row]));

    // Merge registered integrations with DB status
    return registeredIntegrations.map(integration => {
      const dbData = dbIntegrations.get(integration.name);
      return {
        name: integration.name,
        displayName: integration.displayName,
        description: integration.description,
        logoUrl: integration.logoUrl,
        enabled: dbData?.enabled || false,
        createdAt: dbData?.created_at,
        updatedAt: dbData?.updated_at,
      };
    });
  }

  async getIntegration(name: string, orgId: string, projectId: string): Promise<IntegrationDto> {
    const result = await this.db.query(
      `SELECT * FROM kb.integrations
       WHERE name = $1 AND org_id = $2 AND project_id = $3`,
      [name, orgId, projectId]
    );

    if (!result.rowCount) {
      throw new NotFoundException(`Integration ${name} not found`);
    }

    const row = result.rows[0];
    const settings = row.settings_encrypted 
      ? await this.encryptionUtil.decrypt(row.settings_encrypted)
      : {};

    // Mask sensitive fields before returning
    if (settings.authentication?.apiKey) {
      settings.authentication.apiKey = this.maskApiKey(settings.authentication.apiKey);
    }

    return {
      name: row.name,
      displayName: row.display_name,
      description: row.description,
      logoUrl: row.logo_url,
      enabled: row.enabled,
      settings,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async updateIntegration(
    name: string,
    orgId: string,
    projectId: string,
    dto: UpdateIntegrationDto,
  ): Promise<IntegrationDto> {
    // Validate integration exists in registry
    const integration = this.integrationRegistry.get(name);
    if (!integration) {
      throw new BadRequestException(`Integration ${name} not available`);
    }

    // Test configuration if provided
    if (dto.settings) {
      await integration.configure(dto.settings);
      const isValid = await integration.testConnection();
      if (!isValid) {
        throw new BadRequestException('Invalid integration configuration');
      }
    }

    // Encrypt settings
    const encryptedSettings = dto.settings
      ? await this.encryptionUtil.encrypt(JSON.stringify(dto.settings))
      : null;

    // Upsert integration
    const result = await this.db.query(
      `INSERT INTO kb.integrations (name, display_name, description, logo_url, enabled, org_id, project_id, settings_encrypted)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (name, project_id)
       DO UPDATE SET
         enabled = EXCLUDED.enabled,
         settings_encrypted = COALESCE(EXCLUDED.settings_encrypted, kb.integrations.settings_encrypted),
         updated_at = now()
       RETURNING *`,
      [
        name,
        integration.displayName,
        integration.description,
        integration.logoUrl,
        dto.enabled ?? false,
        orgId,
        projectId,
        encryptedSettings,
      ]
    );

    return this.mapRowToDto(result.rows[0]);
  }

  async testConnection(name: string, orgId: string, projectId: string): Promise<{ success: boolean; message: string }> {
    const integration = this.integrationRegistry.get(name);
    if (!integration) {
      throw new NotFoundException(`Integration ${name} not found`);
    }

    try {
      const isConnected = await integration.testConnection();
      return {
        success: isConnected,
        message: isConnected ? 'Connection successful' : 'Connection failed',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async triggerImport(name: string, orgId: string, projectId: string): Promise<string> {
    const integration = this.integrationRegistry.get(name);
    if (!integration?.runFullImport) {
      throw new BadRequestException(`Integration ${name} does not support full import`);
    }

    const jobId = await integration.runFullImport();
    this.logger.log(`Started full import for ${name}, job ID: ${jobId}`);
    return jobId;
  }

  private maskApiKey(key: string): string {
    if (key.length <= 8) return '****';
    return key.substring(0, 4) + '****' + key.substring(key.length - 4);
  }

  private mapRowToDto(row: any): IntegrationDto {
    return {
      name: row.name,
      displayName: row.display_name,
      description: row.description,
      logoUrl: row.logo_url,
      enabled: row.enabled,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
```

#### Registry: `integration.registry.ts`

```typescript
@Injectable()
export class IntegrationRegistry {
  private readonly integrations = new Map<string, BaseIntegration>();

  register(integration: BaseIntegration): void {
    this.integrations.set(integration.name, integration);
  }

  get(name: string): BaseIntegration | undefined {
    return this.integrations.get(name);
  }

  getAll(): BaseIntegration[] {
    return Array.from(this.integrations.values());
  }
}
```

#### Encryption Utility: `encryption.util.ts`

```typescript
@Injectable()
export class EncryptionUtil {
  private readonly key: string;

  constructor(private readonly config: AppConfigService) {
    this.key = this.config.get('INTEGRATION_ENCRYPTION_KEY');
    if (!this.key || this.key.length < 32) {
      throw new Error('INTEGRATION_ENCRYPTION_KEY must be at least 32 characters');
    }
  }

  async encrypt(plaintext: string): Promise<Buffer> {
    const result = await this.db.query(
      `SELECT encode(encrypt($1::bytea, $2, 'aes'), 'base64') as encrypted`,
      [plaintext, this.key]
    );
    return Buffer.from(result.rows[0].encrypted, 'base64');
  }

  async decrypt(ciphertext: Buffer): Promise<any> {
    const result = await this.db.query(
      `SELECT convert_from(decrypt($1::bytea, $2, 'aes'), 'utf-8') as decrypted`,
      [ciphertext, this.key]
    );
    return JSON.parse(result.rows[0].decrypted);
  }
}
```

### 4.2 ClickUpModule

#### File Structure
```
apps/server/src/modules/clickup/
├── clickup.module.ts
├── clickup.service.ts
├── clickup-importer.service.ts
├── clickup-webhook.controller.ts
├── clickup-mapping.service.ts
├── clickup.integration.ts (implements BaseIntegration)
├── dto/
│   └── clickup-webhook.dto.ts
└── utils/
    ├── rate-limiter.util.ts
    └── webhook-verifier.util.ts
```

#### Integration Implementation: `clickup.integration.ts`

```typescript
@Injectable()
export class ClickUpIntegration extends BaseIntegration {
  readonly name = 'clickup';
  readonly displayName = 'ClickUp';
  readonly description = 'Import and sync data from ClickUp.';
  readonly logoUrl = 'https://app-cdn.clickup.com/assets/images/brand/clickup-symbol_color.svg';

  private settings: IntegrationSettings | null = null;

  constructor(
    private readonly clickupService: ClickUpService,
    private readonly clickupImporter: ClickUpImporterService,
  ) {
    super();
  }

  async configure(settings: IntegrationSettings): Promise<void> {
    this.settings = settings;
    this.clickupService.setApiKey(settings.authentication.apiKey);
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.clickupService.getCurrentUser();
      return true;
    } catch (error) {
      return false;
    }
  }

  async runFullImport(): Promise<string> {
    if (!this.settings) {
      throw new BadRequestException('Integration not configured');
    }
    return this.clickupImporter.startFullImport();
  }

  async handleWebhook(payload: any): Promise<void> {
    await this.clickupImporter.handleWebhookEvent(payload);
  }
}
```

#### Service: `clickup.service.ts`

```typescript
@Injectable()
export class ClickUpService {
  private readonly logger = new Logger(ClickUpService.name);
  private apiKey: string | null = null;
  private readonly baseUrl = 'https://api.clickup.com/api/v2';
  private readonly rateLimiter: RateLimiter;

  constructor() {
    // ClickUp rate limit: 100 requests per minute
    this.rateLimiter = new RateLimiter(100, 60000);
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  async getCurrentUser(): Promise<any> {
    return this.request('GET', '/user');
  }

  async getTeams(): Promise<any[]> {
    const response = await this.request('GET', '/team');
    return response.teams || [];
  }

  async getSpaces(teamId: string): Promise<any[]> {
    const response = await this.request('GET', `/team/${teamId}/space`);
    return response.spaces || [];
  }

  async getFolders(spaceId: string): Promise<any[]> {
    const response = await this.request('GET', `/space/${spaceId}/folder`);
    return response.folders || [];
  }

  async getLists(folderId: string): Promise<any[]> {
    const response = await this.request('GET', `/folder/${folderId}/list`);
    return response.lists || [];
  }

  async getTasks(listId: string): Promise<any[]> {
    const response = await this.request('GET', `/list/${listId}/task`);
    return response.tasks || [];
  }

  async getTask(taskId: string): Promise<any> {
    return this.request('GET', `/task/${taskId}`);
  }

  private async request(method: string, path: string, data?: any): Promise<any> {
    if (!this.apiKey) {
      throw new BadRequestException('ClickUp API key not configured');
    }

    await this.rateLimiter.acquire();

    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: data ? JSON.stringify(data) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`ClickUp API error: ${response.status} ${errorText}`);
      throw new BadRequestException(`ClickUp API error: ${response.statusText}`);
    }

    return response.json();
  }
}
```

#### Rate Limiter: `rate-limiter.util.ts`

```typescript
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number, // Max tokens
    private readonly refillInterval: number, // Milliseconds
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens <= 0) {
      const waitTime = this.refillInterval - (Date.now() - this.lastRefill);
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
        this.refill();
      }
    }

    this.tokens--;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;

    if (elapsed >= this.refillInterval) {
      this.tokens = this.capacity;
      this.lastRefill = now;
    }
  }
}
```

#### Importer: `clickup-importer.service.ts`

```typescript
@Injectable()
export class ClickUpImporterService {
  private readonly logger = new Logger(ClickUpImporterService.name);

  constructor(
    private readonly clickupService: ClickUpService,
    private readonly mappingService: ClickUpMappingService,
    private readonly extractionJobService: ExtractionJobService,
    private readonly db: DatabaseService,
  ) {}

  async startFullImport(): Promise<string> {
    // Create extraction job
    const job = await this.extractionJobService.createJob({
      org_id: '...', // Get from context
      project_id: '...', // Get from context
      source_type: 'clickup_import',
      extraction_config: {},
    });

    // Start import in background (Phase 2: use Bull queue)
    this.runImport(job.id).catch(error => {
      this.logger.error(`Full import failed: ${error.message}`, error.stack);
    });

    return job.id;
  }

  private async runImport(jobId: string): Promise<void> {
    try {
      // Update job status to running
      await this.extractionJobService.updateJobStatus(jobId, 'running');

      // Fetch teams (workspaces)
      const teams = await this.clickupService.getTeams();
      
      for (const team of teams) {
        // Map to Organization
        await this.mappingService.importWorkspace(team);

        // Fetch spaces
        const spaces = await this.clickupService.getSpaces(team.id);
        
        for (const space of spaces) {
          // Map to Project
          await this.mappingService.importSpace(space, team.id);

          // Fetch folders
          const folders = await this.clickupService.getFolders(space.id);
          
          for (const folder of folders) {
            // Map to Collection
            await this.mappingService.importFolder(folder, space.id);

            // Fetch lists
            const lists = await this.clickupService.getLists(folder.id);
            
            for (const list of lists) {
              // Map to Collection
              await this.mappingService.importList(list, folder.id);

              // Fetch tasks
              const tasks = await this.clickupService.getTasks(list.id);
              
              for (const task of tasks) {
                // Map to Task
                await this.mappingService.importTask(task, list.id);
              }
            }
          }
        }
      }

      // Update job status to completed
      await this.extractionJobService.updateJobStatus(jobId, 'completed');
      this.logger.log(`Full import completed successfully: ${jobId}`);
    } catch (error) {
      await this.extractionJobService.updateJobStatus(jobId, 'failed', error.message);
      throw error;
    }
  }

  async handleWebhookEvent(payload: any): Promise<void> {
    const { event, data } = payload;

    switch (event) {
      case 'taskCreated':
        await this.mappingService.importTask(data);
        break;
      case 'taskUpdated':
        await this.mappingService.updateTask(data);
        break;
      case 'taskDeleted':
        await this.mappingService.deleteTask(data.id);
        break;
      // Add more event handlers...
      default:
        this.logger.warn(`Unhandled webhook event: ${event}`);
    }
  }
}
```

#### Mapping Service: `clickup-mapping.service.ts`

```typescript
@Injectable()
export class ClickUpMappingService {
  private readonly logger = new Logger(ClickUpMappingService.name);

  constructor(
    private readonly db: DatabaseService,
    // Inject GraphService if needed for creating graph nodes
  ) {}

  async importWorkspace(workspace: any): Promise<void> {
    // Map ClickUp workspace to Organization
    // Implementation depends on graph schema
    this.logger.log(`Importing workspace: ${workspace.name}`);
    
    // Create graph node with label 'Organization'
    // Store external_id reference to ClickUp workspace ID
  }

  async importSpace(space: any, workspaceId: string): Promise<void> {
    // Map ClickUp space to Project
    this.logger.log(`Importing space: ${space.name}`);
  }

  async importFolder(folder: any, spaceId: string): Promise<void> {
    // Map ClickUp folder to Collection
    this.logger.log(`Importing folder: ${folder.name}`);
  }

  async importList(list: any, parentId: string): Promise<void> {
    // Map ClickUp list to Collection
    this.logger.log(`Importing list: ${list.name}`);
  }

  async importTask(task: any, listId?: string): Promise<void> {
    // Map ClickUp task to Task
    this.logger.log(`Importing task: ${task.name}`);
    
    // Handle subtasks, comments, assignees, custom fields
  }

  async updateTask(task: any): Promise<void> {
    // Update existing task
    this.logger.log(`Updating task: ${task.name}`);
  }

  async deleteTask(taskId: string): Promise<void> {
    // Soft delete or remove task node
    this.logger.log(`Deleting task: ${taskId}`);
  }
}
```

#### Webhook Controller: `clickup-webhook.controller.ts`

```typescript
@Controller('webhooks/clickup')
export class ClickUpWebhookController {
  private readonly logger = new Logger(ClickUpWebhookController.name);

  constructor(
    private readonly clickupImporter: ClickUpImporterService,
    private readonly webhookVerifier: WebhookVerifierUtil,
  ) {}

  @Post()
  async handleWebhook(
    @Body() payload: any,
    @Headers('x-signature') signature: string,
  ): Promise<{ status: string }> {
    // Verify webhook signature
    const isValid = this.webhookVerifier.verify(payload, signature);
    if (!isValid) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    this.logger.log(`Received webhook event: ${payload.event}`);

    // Process webhook asynchronously
    this.clickupImporter.handleWebhookEvent(payload).catch(error => {
      this.logger.error(`Webhook processing failed: ${error.message}`, error.stack);
    });

    return { status: 'ok' };
  }
}
```

#### Webhook Verifier: `webhook-verifier.util.ts`

```typescript
import * as crypto from 'crypto';

@Injectable()
export class WebhookVerifierUtil {
  constructor(private readonly db: DatabaseService) {}

  verify(payload: any, signature: string): boolean {
    // Get webhook secret from integration config
    // This is a simplified version - retrieve secret from DB in production
    const secret = process.env.CLICKUP_WEBHOOK_SECRET || '';

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    const expectedSignature = hmac.digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }
}
```

---

## 5. Frontend Implementation

### 5.1 Integration Gallery Page

#### File Structure
```
apps/admin/src/pages/admin/apps/integrations/
├── index.tsx (main page)
├── components/
│   ├── IntegrationCard.tsx
│   ├── ConfigurationModal.tsx
│   └── ClickUpConfigForm.tsx
└── hooks/
    └── useIntegrations.ts
```

#### Main Page: `index.tsx`

```tsx
import { useState } from 'react';
import { useIntegrations } from './hooks/useIntegrations';
import { IntegrationCard } from './components/IntegrationCard';
import { ConfigurationModal } from './components/ConfigurationModal';

export default function IntegrationsPage() {
  const { integrations, isLoading, updateIntegration } = useIntegrations();
  const [selectedIntegration, setSelectedIntegration] = useState<string | null>(null);

  if (isLoading) {
    return <div className="loading loading-spinner loading-lg"></div>;
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Integration Gallery</h1>
        <p className="text-base-content/60 mt-2">
          Connect and manage third-party integrations for your project
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {integrations.map((integration) => (
          <IntegrationCard
            key={integration.name}
            integration={integration}
            onConfigure={() => setSelectedIntegration(integration.name)}
            onToggle={async (enabled) => {
              await updateIntegration(integration.name, { enabled });
            }}
          />
        ))}
      </div>

      {selectedIntegration && (
        <ConfigurationModal
          integrationName={selectedIntegration}
          onClose={() => setSelectedIntegration(null)}
        />
      )}
    </div>
  );
}
```

#### Component: `IntegrationCard.tsx`

```tsx
import { Badge, Card, Toggle } from '@/components/ui';

interface IntegrationCardProps {
  integration: {
    name: string;
    displayName: string;
    description: string;
    logoUrl: string;
    enabled: boolean;
  };
  onConfigure: () => void;
  onToggle: (enabled: boolean) => void;
}

export function IntegrationCard({ integration, onConfigure, onToggle }: IntegrationCardProps) {
  return (
    <Card className="hover:shadow-lg transition-shadow">
      <Card.Body>
        <div className="flex items-start justify-between mb-4">
          <img
            src={integration.logoUrl}
            alt={integration.displayName}
            className="w-12 h-12 object-contain"
          />
          {integration.enabled && (
            <Badge color="success" size="sm">Active</Badge>
          )}
        </div>

        <h3 className="text-xl font-semibold mb-2">{integration.displayName}</h3>
        <p className="text-base-content/60 text-sm mb-4 line-clamp-3">
          {integration.description}
        </p>

        <div className="flex items-center justify-between mt-auto pt-4 border-t">
          <div className="flex items-center gap-2">
            <Toggle
              checked={integration.enabled}
              onChange={(e) => onToggle(e.target.checked)}
            />
            <span className="text-sm">{integration.enabled ? 'Enabled' : 'Disabled'}</span>
          </div>
          <button
            className="btn btn-sm btn-primary"
            onClick={onConfigure}
          >
            Configure
          </button>
        </div>
      </Card.Body>
    </Card>
  );
}
```

#### Component: `ConfigurationModal.tsx`

```tsx
import { Modal } from '@/components/ui';
import { ClickUpConfigForm } from './ClickUpConfigForm';

interface ConfigurationModalProps {
  integrationName: string;
  onClose: () => void;
}

export function ConfigurationModal({ integrationName, onClose }: ConfigurationModalProps) {
  return (
    <Modal open onClose={onClose} size="lg">
      <Modal.Header>
        <h3 className="text-2xl font-bold">Configure {integrationName}</h3>
      </Modal.Header>
      <Modal.Body>
        {integrationName === 'clickup' && <ClickUpConfigForm onClose={onClose} />}
        {/* Add more integration-specific forms here */}
      </Modal.Body>
    </Modal>
  );
}
```

#### Component: `ClickUpConfigForm.tsx`

```tsx
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { api } from '@/api';

interface ClickUpSettings {
  authentication: {
    method: 'apikey';
    apiKey: string;
  };
  syncSettings: {
    autoSync: boolean;
  };
}

export function ClickUpConfigForm({ onClose }: { onClose: () => void }) {
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const { register, handleSubmit, formState: { errors } } = useForm<ClickUpSettings>();

  const onSubmit = async (data: ClickUpSettings) => {
    try {
      await api.put('/api/v1/integrations/clickup', {
        enabled: true,
        settings: data,
      });
      alert('Configuration saved successfully');
      onClose();
    } catch (error) {
      alert('Failed to save configuration');
    }
  };

  const testConnection = async () => {
    setIsTesting(true);
    try {
      const result = await api.post('/api/v1/integrations/clickup/test');
      setTestResult(result.data);
    } catch (error) {
      setTestResult({ success: false, message: 'Connection test failed' });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div>
        <label className="label">
          <span className="label-text">API Key</span>
        </label>
        <input
          type="password"
          className="input input-bordered w-full"
          placeholder="pk_..."
          {...register('authentication.apiKey', { required: 'API key is required' })}
        />
        {errors.authentication?.apiKey && (
          <span className="text-error text-sm">{errors.authentication.apiKey.message}</span>
        )}
        <label className="label">
          <span className="label-text-alt">
            <a
              href="https://docs.clickup.com/en/articles/1367130-getting-started-with-the-clickup-api"
              target="_blank"
              rel="noopener noreferrer"
              className="link link-primary"
            >
              How to get your API key
            </a>
          </span>
        </label>
      </div>

      <div className="form-control">
        <label className="label cursor-pointer justify-start gap-4">
          <input
            type="checkbox"
            className="toggle toggle-primary"
            {...register('syncSettings.autoSync')}
          />
          <span className="label-text">Enable automatic sync</span>
        </label>
      </div>

      {testResult && (
        <div className={`alert ${testResult.success ? 'alert-success' : 'alert-error'}`}>
          <span>{testResult.message}</span>
        </div>
      )}

      <div className="flex gap-4">
        <button
          type="button"
          className="btn btn-outline"
          onClick={testConnection}
          disabled={isTesting}
        >
          {isTesting ? 'Testing...' : 'Test Connection'}
        </button>
        <button type="submit" className="btn btn-primary flex-1">
          Save Configuration
        </button>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}
```

#### Hook: `useIntegrations.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';

export function useIntegrations() {
  const queryClient = useQueryClient();

  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ['integrations'],
    queryFn: async () => {
      const response = await api.get('/api/v1/integrations', {
        params: {
          project_id: getCurrentProjectId(), // Implement this
          org_id: getCurrentOrgId(), // Implement this
        },
      });
      return response.data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ name, data }: { name: string; data: any }) => {
      return api.put(`/api/v1/integrations/${name}`, data, {
        params: {
          project_id: getCurrentProjectId(),
          org_id: getCurrentOrgId(),
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
  });

  return {
    integrations,
    isLoading,
    updateIntegration: (name: string, data: any) => updateMutation.mutate({ name, data }),
  };
}

function getCurrentProjectId(): string {
  // Implement based on your app's context/state management
  return 'project-id';
}

function getCurrentOrgId(): string {
  // Implement based on your app's context/state management
  return 'org-id';
}
```

### 5.2 Route Registration

Update `/apps/admin/src/router/register.tsx`:

```typescript
// Add to dashboardRoutes array
{
  path: "/admin/apps/integrations",
  element: cw(lazy(() => import("@/pages/admin/apps/integrations/index")))
},
```

### 5.3 Navigation Update

Add integration gallery link to the admin sidebar navigation (exact location depends on your nav structure).

---

## 6. Testing Strategy

### 6.1 Backend Tests

#### Integration Tests: `integrations.e2e.spec.ts`

```typescript
describe('Integrations API (e2e)', () => {
  it('GET /api/v1/integrations - should list all integrations', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/integrations')
      .query({ project_id: 'test-project', org_id: 'test-org' })
      .expect(200);

    expect(response.body).toBeInstanceOf(Array);
    expect(response.body.length).toBeGreaterThan(0);
  });

  it('PUT /api/v1/integrations/:name - should update integration', async () => {
    const response = await request(app.getHttpServer())
      .put('/api/v1/integrations/clickup')
      .query({ project_id: 'test-project', org_id: 'test-org' })
      .send({
        enabled: true,
        settings: {
          authentication: { method: 'apikey', apiKey: 'test-key' },
        },
      })
      .expect(200);

    expect(response.body.enabled).toBe(true);
  });
});
```

#### Unit Tests: `clickup.service.spec.ts`

```typescript
describe('ClickUpService', () => {
  let service: ClickUpService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [ClickUpService],
    }).compile();

    service = module.get<ClickUpService>(ClickUpService);
  });

  it('should respect rate limits', async () => {
    service.setApiKey('test-key');
    
    const start = Date.now();
    const promises = Array.from({ length: 105 }, () => service.getTeams());
    await Promise.all(promises);
    const duration = Date.now() - start;

    // Should take at least 1 minute to complete 105 requests
    expect(duration).toBeGreaterThanOrEqual(60000);
  });
});
```

### 6.2 Frontend Tests

#### Component Tests: `IntegrationCard.test.tsx`

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { IntegrationCard } from './IntegrationCard';

describe('IntegrationCard', () => {
  const mockIntegration = {
    name: 'clickup',
    displayName: 'ClickUp',
    description: 'Import and sync data from ClickUp',
    logoUrl: 'https://example.com/logo.svg',
    enabled: false,
  };

  it('should render integration details', () => {
    render(
      <IntegrationCard
        integration={mockIntegration}
        onConfigure={jest.fn()}
        onToggle={jest.fn()}
      />
    );

    expect(screen.getByText('ClickUp')).toBeInTheDocument();
    expect(screen.getByText(/Import and sync/)).toBeInTheDocument();
  });

  it('should call onToggle when toggle is clicked', () => {
    const onToggle = jest.fn();
    render(
      <IntegrationCard
        integration={mockIntegration}
        onConfigure={jest.fn()}
        onToggle={onToggle}
      />
    );

    fireEvent.click(screen.getByRole('checkbox'));
    expect(onToggle).toHaveBeenCalledWith(true);
  });
});
```

---

## 7. Deployment Checklist

### 7.1 Environment Variables

Add to `.env` or secrets manager:

```bash
# Integration encryption key (32+ characters)
INTEGRATION_ENCRYPTION_KEY=your-secure-encryption-key-here

# ClickUp webhook secret (set in ClickUp webhook config)
CLICKUP_WEBHOOK_SECRET=your-webhook-secret-here
```

### 7.2 Database Migration

```bash
# Run migration
npm run migration:run

# Verify tables
psql -d your_database -c "\dt kb.integrations"
psql -d your_database -c "\dt kb.clickup_sync_state"
```

### 7.3 Security Scopes

Add to `SECURITY_SCOPES.md`:

- `integrations:read` - View integrations and their status
- `integrations:write` - Configure and manage integrations

### 7.4 API Documentation

Ensure OpenAPI spec is regenerated:

```bash
npm run openapi:generate
```

---

## 8. Future Enhancements (Post-MVP)

### Phase 2 Features

1. **OAuth 2.0 Support**: Implement full OAuth flow for ClickUp
2. **Background Job Queue**: Use Bull/BullMQ for async import processing
3. **Webhook Retry Logic**: Retry failed webhook events with exponential backoff
4. **Incremental Sync**: Use ClickUp's updated_since parameter for efficient syncing
5. **More Integrations**: Jira, Asana, Trello, GitHub Issues, etc.
6. **Webhook Management UI**: Display webhook URL, regenerate secret, view event logs
7. **Import Progress UI**: Real-time progress bar for full imports
8. **Data Conflict Resolution**: Handle conflicts when local data is modified
9. **Custom Field Mapping UI**: Allow users to customize data mappings
10. **Integration Analytics**: Track sync frequency, data volume, error rates

---

## 9. Open Questions & Clarifications Needed

### 9.1 Specification Ambiguities

| Question | Proposed Resolution | Status |
|----------|---------------------|--------|
| Should integrations be scoped to organization or project? | Project-level scoping (allows different projects to have different integrations) | ✅ Decided |
| How to handle ClickUp webhook signature verification? | Use HMAC-SHA256 with secret stored in integration config | ✅ Decided |
| What happens to imported data when integration is disabled? | Keep data, stop syncing (soft disable). Add delete option in Phase 2. | ✅ Decided |
| Should we support multiple ClickUp accounts per project? | No, one integration instance per project for MVP | ✅ Decided |
| How to handle ClickUp custom fields? | Store as JSON properties on graph objects | ✅ Decided |
| What if user already has data in the system that conflicts with import? | Latest write wins; add conflict resolution UI in Phase 2 | ✅ Decided |
| Should full import run in foreground or background? | Background (use extraction job pattern) | ✅ Decided |
| How to handle ClickUp rate limits during import? | Token bucket rate limiter (100 req/min) | ✅ Decided |

### 9.2 Technical Decisions to Validate

1. **Graph Schema**: Confirm graph node labels and relationship types match existing schema
2. **Permissions**: Verify that project admins can manage integrations (check with auth team)
3. **Encryption Key Rotation**: Define process for rotating `INTEGRATION_ENCRYPTION_KEY` in production
4. **Webhook Endpoint Security**: Should webhooks require authentication beyond signature verification?
5. **Import Idempotency**: Confirm that re-running full import doesn't create duplicates

---

## 10. Implementation Timeline

### Estimated Effort: 3-5 days

| Phase | Tasks | Estimated Time |
|-------|-------|----------------|
| **Day 1: Database & Core Infrastructure** | Database migration, IntegrationsModule scaffolding, encryption utilities | 6-8 hours |
| **Day 2: ClickUp Backend** | ClickUpService, rate limiter, importer, webhook controller | 6-8 hours |
| **Day 3: Frontend Gallery** | Integration gallery page, cards, configuration modal | 6-8 hours |
| **Day 4: ClickUp UI & Testing** | ClickUp config form, E2E tests, unit tests | 6-8 hours |
| **Day 5: Documentation & Polish** | API docs, README updates, error handling, edge cases | 4-6 hours |

---

## 11. Success Criteria

### MVP Acceptance Criteria

✅ **Integration Gallery**
- [ ] Gallery page displays all available integrations
- [ ] Each integration card shows logo, name, description, status
- [ ] Toggle switch enables/disables integrations
- [ ] Configure button opens settings modal

✅ **ClickUp Integration**
- [ ] User can configure ClickUp with API key
- [ ] Test connection validates API key
- [ ] Full import button triggers import job
- [ ] Import creates graph nodes for workspaces, spaces, folders, lists, tasks
- [ ] Webhook endpoint receives and processes ClickUp events
- [ ] Credentials are encrypted in database

✅ **Quality**
- [ ] All E2E tests pass
- [ ] API documentation is complete
- [ ] Error handling is comprehensive
- [ ] Logging is detailed and useful

---

## 12. References

- **ClickUp API Docs**: https://clickup.com/api/
- **Spec 22**: `docs/spec/22-clickup-integration.md`
- **Spec 23**: `docs/spec/23-integration-gallery.md`
- **Existing Patterns**:
  - Extraction jobs: `apps/server/src/modules/extraction-jobs/`
  - Auth guards: `apps/server/src/modules/auth/`
  - DaisyUI components: `apps/admin/src/components/`

---

**End of Implementation Plan**
