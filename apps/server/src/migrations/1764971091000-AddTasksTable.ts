import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add Tasks Table
 *
 * Creates a project-scoped tasks table for actionable items (like merge suggestions)
 * that are separate from personal notifications.
 *
 * Key differences from notifications:
 * - Tasks are project-scoped (shared across all project members)
 * - Notifications are user-scoped (personal)
 * - A notification can optionally link to a task
 * - Anyone in the project can resolve a task
 */
export class AddTasksTable1764971091000 implements MigrationInterface {
  name = 'AddTasksTable1764971091000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create tasks table
    await queryRunner.query(`
      CREATE TABLE kb.tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
        
        -- Content
        title TEXT NOT NULL,
        description TEXT,
        type TEXT NOT NULL,  -- 'merge_suggestion', 'review_request', etc.
        
        -- Resolution
        status TEXT NOT NULL DEFAULT 'pending',  -- pending, accepted, rejected, cancelled
        resolved_at TIMESTAMPTZ,
        resolved_by UUID,  -- user who resolved
        resolution_notes TEXT,
        
        -- Source tracking
        source_type TEXT,  -- 'agent', 'user', 'system'
        source_id TEXT,    -- agent run ID, user ID, etc.
        
        -- Task-specific data
        metadata JSONB DEFAULT '{}',
        
        -- Timestamps
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Index for querying tasks by project and status
      CREATE INDEX idx_tasks_project_status ON kb.tasks(project_id, status);
      
      -- Index for querying tasks by type
      CREATE INDEX idx_tasks_type ON kb.tasks(type);
      
      -- Index for querying pending tasks
      CREATE INDEX idx_tasks_pending ON kb.tasks(status) WHERE status = 'pending';

      COMMENT ON TABLE kb.tasks IS 'Project-scoped actionable items that require user decision';
      COMMENT ON COLUMN kb.tasks.type IS 'Type of task: merge_suggestion, review_request, etc.';
      COMMENT ON COLUMN kb.tasks.status IS 'Current status: pending, accepted, rejected, cancelled';
      COMMENT ON COLUMN kb.tasks.metadata IS 'Task-specific data like sourceObjectId, targetObjectId, similarity, etc.';
    `);

    // Add task_id column to notifications
    await queryRunner.query(`
      ALTER TABLE kb.notifications 
      ADD COLUMN task_id UUID REFERENCES kb.tasks(id) ON DELETE SET NULL;

      CREATE INDEX idx_notifications_task ON kb.notifications(task_id);

      COMMENT ON COLUMN kb.notifications.task_id IS 'Optional link to a task that this notification references';
    `);

    // Remove action_status columns from notifications (now handled by tasks)
    // We keep them for now for backwards compatibility, but they will be deprecated
    await queryRunner.query(`
      COMMENT ON COLUMN kb.notifications.action_status IS 'DEPRECATED: Use linked task status instead';
      COMMENT ON COLUMN kb.notifications.action_status_at IS 'DEPRECATED: Use linked task resolved_at instead';
      COMMENT ON COLUMN kb.notifications.action_status_by IS 'DEPRECATED: Use linked task resolved_by instead';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove task_id from notifications
    await queryRunner.query(`
      DROP INDEX IF EXISTS kb.idx_notifications_task;
      ALTER TABLE kb.notifications DROP COLUMN IF EXISTS task_id;
    `);

    // Drop tasks table
    await queryRunner.query(`
      DROP INDEX IF EXISTS kb.idx_tasks_pending;
      DROP INDEX IF EXISTS kb.idx_tasks_type;
      DROP INDEX IF EXISTS kb.idx_tasks_project_status;
      DROP TABLE IF EXISTS kb.tasks;
    `);

    // Restore comments on action_status columns
    await queryRunner.query(`
      COMMENT ON COLUMN kb.notifications.action_status IS 'Action status for actionable notifications';
      COMMENT ON COLUMN kb.notifications.action_status_at IS 'When the action was taken';
      COMMENT ON COLUMN kb.notifications.action_status_by IS 'User who took the action';
    `);
  }
}
