import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Make notification project_id nullable
 *
 * Release notifications are system-wide (not project-specific) and don't have a project ID.
 * This migration makes the project_id column nullable to support system-wide notifications.
 */
export class MakeNotificationProjectIdNullable1767183000000
  implements MigrationInterface
{
  name = 'MakeNotificationProjectIdNullable1767183000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Make project_id nullable for system-wide notifications (e.g., release notifications)
    await queryRunner.query(`
      ALTER TABLE kb.notifications
      ALTER COLUMN project_id DROP NOT NULL;
    `);

    // Update the foreign key to allow NULL values (ON DELETE SET NULL instead of CASCADE)
    // First drop the existing constraint
    await queryRunner.query(`
      ALTER TABLE kb.notifications
      DROP CONSTRAINT IF EXISTS "FK_notifications_project_id";
    `);

    // Re-add with SET NULL behavior for when project is deleted
    await queryRunner.query(`
      ALTER TABLE kb.notifications
      ADD CONSTRAINT "FK_notifications_project_id"
      FOREIGN KEY (project_id)
      REFERENCES kb.projects(id)
      ON DELETE SET NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore CASCADE behavior
    await queryRunner.query(`
      ALTER TABLE kb.notifications
      DROP CONSTRAINT IF EXISTS "FK_notifications_project_id";
    `);

    await queryRunner.query(`
      ALTER TABLE kb.notifications
      ADD CONSTRAINT "FK_notifications_project_id"
      FOREIGN KEY (project_id)
      REFERENCES kb.projects(id)
      ON DELETE CASCADE;
    `);

    // Delete any notifications without project_id before making it NOT NULL
    await queryRunner.query(`
      DELETE FROM kb.notifications WHERE project_id IS NULL;
    `);

    // Make project_id NOT NULL again
    await queryRunner.query(`
      ALTER TABLE kb.notifications
      ALTER COLUMN project_id SET NOT NULL;
    `);
  }
}
