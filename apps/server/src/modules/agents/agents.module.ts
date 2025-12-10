import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { Agent, AgentRun, Task } from '../../entities';
import { GraphObject } from '../../entities/graph-object.entity';
import { AgentService } from './agents.service';
import { AgentSchedulerService } from './agent-scheduler.service';
import { AgentStrategyRegistry } from './strategies/agent-strategy.registry';
import { MergeSuggestionStrategy } from './strategies/merge-suggestion.strategy';
import { AgentsController } from './agents.controller';
import { AuthModule } from '../auth/auth.module';
import { GraphModule } from '../graph/graph.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TasksModule } from '../tasks/tasks.module';
import { LangfuseModule } from '../langfuse/langfuse.module';

/**
 * AgentsModule
 *
 * Provides the agent system for automated background tasks.
 * Agents are configured in the database and run on cron schedules.
 *
 * Components:
 * - AgentService: CRUD operations for agents and run tracking
 * - AgentSchedulerService: Dynamic cron scheduling
 * - AgentStrategyRegistry: Strategy lookup by role
 * - Strategies: Implement AgentStrategy interface (e.g., MergeSuggestionStrategy)
 */
@Module({
  imports: [
    // Register entities
    TypeOrmModule.forFeature([Agent, AgentRun, GraphObject, Task]),
    // Enable @nestjs/schedule for cron management
    ScheduleModule.forRoot(),
    // Dependencies
    AuthModule,
    GraphModule,
    NotificationsModule,
    TasksModule,
    LangfuseModule,
  ],
  controllers: [AgentsController],
  providers: [
    AgentService,
    AgentSchedulerService,
    AgentStrategyRegistry,
    // Agent strategies
    MergeSuggestionStrategy,
  ],
  exports: [AgentService, AgentSchedulerService],
})
export class AgentsModule {}
