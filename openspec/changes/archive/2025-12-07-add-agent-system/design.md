# Design: Agent System Architecture

## Overview

This design document specifies the implementation details for an autonomous agent system. Agents are background processes that execute on a schedule or in response to events, performing specific tasks like duplicate detection.

## Core Components

### 1. Data Model

We introduce two TypeORM entities in `apps/server/src/modules/agents/entities/`.

**Agent Entity (`agent.entity.ts`)**

```typescript
@Entity({ schema: 'kb', name: 'agents' })
export class Agent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  role: string; // e.g., 'merge-suggestion', maps to strategy

  @Column({ type: 'varchar', length: 255 })
  name: string; // Display name

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'text' })
  prompt: string; // System prompt, tunable by admin

  @Column({ name: 'cron_schedule', type: 'varchar', length: 50 })
  cronSchedule: string; // e.g., '*/3 * * * *'

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'jsonb', default: {} })
  config: Record<string, any>; // Role-specific config (thresholds, limits)

  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId: string | null; // Scope to project (null = global)

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

**AgentRun Entity (`agent-run.entity.ts`)**

```typescript
@Entity({ schema: 'kb', name: 'agent_runs' })
@Index(['agentId', 'startedAt'])
export class AgentRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'agent_id', type: 'uuid' })
  agentId: string;

  @Column({ type: 'varchar', length: 50 })
  status: 'running' | 'completed' | 'failed' | 'skipped';

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'result_summary', type: 'text', nullable: true })
  resultSummary: string | null;

  @Column({ type: 'jsonb', nullable: true })
  logs: Record<string, any> | null; // Execution details, errors

  @Column({ name: 'items_processed', type: 'int', default: 0 })
  itemsProcessed: number;

  @Column({ name: 'items_created', type: 'int', default: 0 })
  itemsCreated: number;

  @ManyToOne(() => Agent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agent_id' })
  agent: Agent;
}
```

### 2. Module Structure

```
apps/server/src/modules/agents/
├── agents.module.ts
├── agents.controller.ts        # Admin API for listing/updating agents
├── agents.service.ts           # Core scheduling and execution logic
├── agent-scheduler.service.ts  # Manages CronJobs via SchedulerRegistry
├── entities/
│   ├── agent.entity.ts
│   └── agent-run.entity.ts
├── dto/
│   ├── agent.dto.ts
│   ├── update-agent.dto.ts
│   └── agent-run.dto.ts
└── strategies/
    ├── agent-strategy.interface.ts
    ├── agent-strategy.registry.ts
    └── merge-suggestion.strategy.ts
```

### 3. Execution Engine

**AgentSchedulerService**

Uses `@nestjs/schedule` `SchedulerRegistry` to dynamically manage CronJobs.

```typescript
@Injectable()
export class AgentSchedulerService implements OnModuleInit {
  constructor(
    private schedulerRegistry: SchedulerRegistry,
    private agentsService: AgentsService,
    @InjectRepository(Agent)
    private agentRepo: Repository<Agent>
  ) {}

  async onModuleInit() {
    await this.loadAndScheduleAgents();
  }

  private async loadAndScheduleAgents() {
    const agents = await this.agentRepo.find({ where: { enabled: true } });
    for (const agent of agents) {
      this.scheduleAgent(agent);
    }
  }

  scheduleAgent(agent: Agent) {
    const jobName = `agent:${agent.id}`;
    // Remove existing if present
    if (this.schedulerRegistry.doesExist('cron', jobName)) {
      this.schedulerRegistry.deleteCronJob(jobName);
    }
    const job = new CronJob(agent.cronSchedule, () => {
      this.agentsService.executeAgent(agent.id);
    });
    this.schedulerRegistry.addCronJob(jobName, job);
    job.start();
  }

  unscheduleAgent(agentId: string) {
    const jobName = `agent:${agentId}`;
    if (this.schedulerRegistry.doesExist('cron', jobName)) {
      this.schedulerRegistry.deleteCronJob(jobName);
    }
  }
}
```

**AgentsService.executeAgent()**

```typescript
async executeAgent(agentId: string): Promise<void> {
  const agent = await this.agentRepo.findOne({ where: { id: agentId } });
  if (!agent || !agent.enabled) return;

  // Prevent concurrent runs
  const runningRun = await this.agentRunRepo.findOne({
    where: { agentId, status: 'running' }
  });
  if (runningRun) {
    this.logger.warn(`Agent ${agent.role} already running, skipping`);
    return;
  }

  // Create run record
  const run = this.agentRunRepo.create({
    agentId,
    status: 'running',
    startedAt: new Date(),
  });
  await this.agentRunRepo.save(run);

  try {
    const strategy = this.strategyRegistry.getStrategy(agent.role);
    const result = await strategy.execute(agent, run);

    run.status = result.skipped ? 'skipped' : 'completed';
    run.resultSummary = result.summary;
    run.itemsProcessed = result.itemsProcessed;
    run.itemsCreated = result.itemsCreated;
    run.completedAt = new Date();
  } catch (error) {
    run.status = 'failed';
    run.logs = { error: error.message, stack: error.stack };
    run.completedAt = new Date();
  }

  await this.agentRunRepo.save(run);
}
```

### 4. Strategy Pattern

**AgentStrategy Interface**

```typescript
export interface AgentStrategyResult {
  skipped: boolean;
  summary: string;
  itemsProcessed: number;
  itemsCreated: number;
}

export interface AgentStrategy {
  readonly role: string;
  execute(agent: Agent, run: AgentRun): Promise<AgentStrategyResult>;
}
```

**Strategy Registry**

```typescript
@Injectable()
export class AgentStrategyRegistry {
  private strategies = new Map<string, AgentStrategy>();

  register(strategy: AgentStrategy) {
    this.strategies.set(strategy.role, strategy);
  }

  getStrategy(role: string): AgentStrategy {
    const strategy = this.strategies.get(role);
    if (!strategy) throw new Error(`No strategy for role: ${role}`);
    return strategy;
  }
}
```

### 5. Merge Suggestion Strategy Implementation

**File:** `strategies/merge-suggestion.strategy.ts`

```typescript
@Injectable()
export class MergeSuggestionStrategy implements AgentStrategy {
  readonly role = 'merge-suggestion';

  constructor(
    private vectorSearch: GraphVectorSearchService,
    private notificationsService: NotificationsService,
    private db: DatabaseService
  ) {}

  async execute(agent: Agent, run: AgentRun): Promise<AgentStrategyResult> {
    const config = agent.config as MergeSuggestionConfig;
    const maxPending = config.maxPendingSuggestions ?? 5;
    const similarityThreshold = config.similarityThreshold ?? 0.1; // cosine distance (0.10 = 90% similar)
    const batchSize = config.batchSize ?? 50;

    // Step 1: Check pending suggestions count
    const pendingCount = await this.countPendingSuggestions(agent.projectId);
    if (pendingCount >= maxPending) {
      return {
        skipped: true,
        summary: `Skipped: ${pendingCount} pending suggestions (max: ${maxPending})`,
        itemsProcessed: 0,
        itemsCreated: 0,
      };
    }

    // Step 2: Get batch of objects to scan
    const objects = await this.getObjectsToScan(agent.projectId, batchSize);

    let created = 0;
    let processed = 0;

    for (const obj of objects) {
      processed++;

      // Step 3: Vector search for similar objects
      const similar = await this.vectorSearch.searchSimilar(obj.id, {
        projectId: agent.projectId,
        maxDistance: similarityThreshold,
        limit: 5,
      });

      for (const match of similar) {
        if (match.id === obj.id) continue;

        // Step 4: Check for existing suggestion
        const existing = await this.findExistingSuggestion(obj.id, match.id);

        if (existing) {
          // Update if better match
          if (match.distance < existing.details?.similarity) {
            await this.updateSuggestion(existing.id, match.distance);
          }
        } else {
          // Create new suggestion
          await this.createMergeSuggestion(agent, obj, match);
          created++;
        }
      }
    }

    return {
      skipped: false,
      summary: `Processed ${processed} objects, created ${created} suggestions`,
      itemsProcessed: processed,
      itemsCreated: created,
    };
  }

  private async countPendingSuggestions(
    projectId: string | null
  ): Promise<number> {
    const result = await this.db.query(
      `SELECT COUNT(*) as count FROM kb.notifications 
       WHERE type = 'agent:merge_suggestion' 
       AND cleared_at IS NULL
       ${projectId ? 'AND project_id = $1' : ''}`,
      projectId ? [projectId] : []
    );
    return parseInt(result.rows[0].count, 10);
  }

  private async getObjectsToScan(projectId: string | null, limit: number) {
    // Get recently created/updated objects with embeddings
    const result = await this.db.query(
      `SELECT id, key, type, properties 
       FROM kb.graph_objects 
       WHERE embedding_v2 IS NOT NULL 
       AND deleted_at IS NULL
       ${projectId ? 'AND project_id = $1' : ''}
       ORDER BY updated_at DESC 
       LIMIT $${projectId ? 2 : 1}`,
      projectId ? [projectId, limit] : [limit]
    );
    return result.rows;
  }

  private async createMergeSuggestion(
    agent: Agent,
    source: any,
    match: VectorSearchResultRow
  ) {
    // Get target object details
    const targetResult = await this.db.query(
      'SELECT key, type, properties FROM kb.graph_objects WHERE id = $1',
      [match.id]
    );
    const target = targetResult.rows[0];

    // Get admin users for this project to notify
    const adminUsers = await this.getProjectAdmins(agent.projectId);

    for (const userId of adminUsers) {
      await this.notificationsService.create({
        subject_id: userId,
        project_id: agent.projectId,
        category: 'agent',
        importance: 'important',
        title: `Potential Duplicate: "${source.key}" and "${target.key}"`,
        message: `These objects appear to be duplicates (${(
          (1 - match.distance) *
          100
        ).toFixed(1)}% similar). Review and merge if appropriate.`,
        type: 'agent:merge_suggestion',
        severity: 'warning',
        source_type: 'agent',
        source_id: agent.id,
        details: {
          sourceId: source.id,
          sourceKey: source.key,
          sourceType: source.type,
          targetId: match.id,
          targetKey: target.key,
          targetType: target.type,
          similarity: match.distance, // cosine distance
          similarityPercent: (1 - match.distance) * 100,
          agentRole: agent.role,
        },
        actions: [
          {
            label: 'Review Merge',
            url: `/admin/objects/merge?source=${source.id}&target=${match.id}`,
            style: 'primary',
          },
          {
            label: 'View Source',
            url: `/admin/objects/${source.id}`,
            style: 'secondary',
          },
          {
            label: 'Dismiss',
            url: null, // Client handles dismiss action
            style: 'ghost',
          },
        ],
        related_resource_type: 'graph_object',
        related_resource_id: source.id,
        group_key: `merge:${[source.id, match.id].sort().join(':')}`,
      } as any);
    }
  }
}
```

### 6. Actionable Notification Pattern

Notifications are distinguished by their `type` field:

| Type                      | Category      | Behavior                                            |
| ------------------------- | ------------- | --------------------------------------------------- |
| `null` / `info`           | Informational | Read-only; user marks as read/dismissed             |
| `agent:merge_suggestion`  | Actionable    | Renders merge review UI; action clears notification |
| `agent:create_suggestion` | Actionable    | Renders create object UI                            |
| `agent:delete_suggestion` | Actionable    | Renders delete confirmation UI                      |
| `extraction_complete`     | Informational | Links to extraction results                         |

**Actionable Notification Contract:**

1. **`type`**: Prefixed with `agent:` for agent-generated actionable notifications
2. **`details`**: Contains all data needed to execute the action:
   - For merge: `{ sourceId, targetId, similarity, ... }`
   - For create: `{ suggestedType, suggestedProperties, ... }`
3. **`actions`**: Array of button configs for UI rendering:
   ```typescript
   interface NotificationAction {
     label: string;
     url: string | null; // null = client-side action
     style: 'primary' | 'secondary' | 'warning' | 'danger' | 'ghost';
   }
   ```
4. **`group_key`**: Used to find/update existing suggestions (e.g., `merge:uuid1:uuid2`)

### 7. API Endpoints

**AgentsController**

```typescript
@Controller('agents')
@UseGuards(JwtAuthGuard)
export class AgentsController {
  @Get()
  @Scopes('agents:read')
  async list(): Promise<Agent[]> {}

  @Get(':id')
  @Scopes('agents:read')
  async get(@Param('id') id: string): Promise<Agent> {}

  @Patch(':id')
  @Scopes('agents:write')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAgentDto
  ): Promise<Agent> {}

  @Post(':id/run')
  @Scopes('agents:write')
  async triggerRun(@Param('id') id: string): Promise<AgentRun> {}

  @Get(':id/runs')
  @Scopes('agents:read')
  async listRuns(@Param('id') id: string): Promise<AgentRun[]> {}
}
```

**UpdateAgentDto**

```typescript
export class UpdateAgentDto {
  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @IsString()
  @Matches(
    /^[\d*,\-\/]+\s+[\d*,\-\/]+\s+[\d*,\-\/]+\s+[\d*,\-\/]+\s+[\d*,\-\/]+$/
  )
  cronSchedule?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;
}
```

### 8. Migration

**Migration file:** `1765XXXXXXXXX-AddAgentTables.ts`

```sql
-- Create agents table
CREATE TABLE kb.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  prompt TEXT NOT NULL,
  cron_schedule VARCHAR(50) NOT NULL,
  enabled BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}',
  project_id UUID REFERENCES kb.projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create agent_runs table
CREATE TABLE kb.agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES kb.agents(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  result_summary TEXT,
  logs JSONB,
  items_processed INT DEFAULT 0,
  items_created INT DEFAULT 0
);

CREATE INDEX idx_agent_runs_agent_started ON kb.agent_runs(agent_id, started_at DESC);

-- Seed default merge agent
INSERT INTO kb.agents (role, name, description, prompt, cron_schedule, config)
VALUES (
  'merge-suggestion',
  'Duplicate Detector',
  'Scans for similar objects and suggests merges',
  'You are a deduplication assistant. Analyze objects for potential duplicates based on semantic similarity.',
  '*/3 * * * *',
  '{"maxPendingSuggestions": 5, "similarityThreshold": 0.10, "batchSize": 50}'
);
```

## Dependencies

- **New:** `@nestjs/schedule` - For cron job management
- **Existing:** `GraphVectorSearchService` - For similarity search using `embedding_v2 <=> vector` operator
- **Existing:** `NotificationsService` - For creating actionable notifications
- **Existing:** `DatabaseService` - For raw SQL queries

## Technologies

- **NestJS Schedule:** Dynamic cron management via `SchedulerRegistry`
- **pgvector:** Cosine similarity via `<=>` operator on `embedding_v2` column
- **TypeORM:** Entity persistence
- **Strategy Pattern:** Extensible agent roles
