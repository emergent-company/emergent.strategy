# Add Agent System

## Summary

This proposal introduces a system for defining, scheduling, and executing autonomous agents within the application. The first implemented agent will be a "Merge Agent" that periodically scans the knowledge graph for duplicate objects using vector similarity and suggests merges to administrators via the notification inbox.

## Background

The user requires a system where "agents" can perform background tasks based on triggers (schedule or events). These agents must be configurable by admins (specifically their prompts). The immediate need is for a deduplication agent that identifies similar objects and proposes merges, streamlining knowledge base maintenance.

## Goals

1.  **Configurable Agents:** Admins can view and tune agent prompts and schedules.
2.  **Autonomous Execution:** Agents run periodically (e.g., every 3 minutes) without manual intervention.
3.  **Deduplication:** A specific agent identifies duplicate Graph Objects using vector search.
4.  **Human-in-the-Loop:** Agents make _suggestions_ (notifications) rather than destructive changes, requiring admin approval.
5.  **Extensibility:** The system supports future agent roles and event-driven triggers.

## Non-Goals

- **Fully Dynamic Agent Creation:** Admins won't define _new_ types of agents from scratch (code is required for new logic), only tune existing ones.
- **Complex Agent Orchestration:** No DAGs or complex dependency chains between agents initially.
- **Automatic Merging:** Merges will always require approval for now.

## Plan

1.  **Infrastructure:** Install `@nestjs/schedule` and create the `Agent` and `AgentRun` entities.
2.  **Service Layer:** Implement `AgentService` to manage scheduling and execution strategies.
3.  **Merge Logic:** Implement the `MergeAgentStrategy` to query `pgvector`, identify duplicates, and create `Notifications`.
4.  **API:** Expose endpoints for listing and configuring agents.
