import { Injectable, Logger } from '@nestjs/common';
import {
  ClickUpTask,
  ClickUpList,
  ClickUpFolder,
  ClickUpSpace,
  ClickUpWorkspace,
  ClickUpDoc,
  ClickUpPage,
} from './clickup.types';
import { InternalDocument } from '../integrations/document-hierarchy.types';

/**
 * ClickUp Data Mapper Service
 *
 * Maps ClickUp entities to generic internal document structure.
 *
 * This mapper demonstrates how ANY integration can use the generic
 * InternalDocument interface to preserve hierarchical relationships
 * while storing source-specific metadata.
 *
 * Mapping Strategy:
 * - ClickUp Workspace → Organization metadata
 * - ClickUp Space → Top-level document collection
 * - ClickUp Folder → Sub-collection document
 * - ClickUp List → Sub-collection document
 * - ClickUp Task → Main document with rich content
 * - ClickUp Comment → Document chunk/annotation
 *
 * The mapper preserves:
 * - Original IDs for sync tracking
 * - Hierarchical relationships
 * - Custom fields as metadata
 * - User assignments
 * - Dates and status information
 */
@Injectable()
export class ClickUpDataMapper {
  private readonly logger = new Logger(ClickUpDataMapper.name);
  private workspaceId?: string;

  /**
   * Set workspace ID for URL construction
   */
  setWorkspaceId(workspaceId: string): void {
    this.workspaceId = workspaceId;
  }

  /**
   * Build ClickUp URL for an object
   * Based on patterns from docs/spec/22-clickup-integration.md section 3.3.1
   */
  private buildClickUpUrl(type: string, id: string): string | undefined {
    if (!this.workspaceId) return undefined;

    switch (type) {
      case 'task':
        return `https://app.clickup.com/t/${id}`;
      case 'list':
        return `https://app.clickup.com/t/${this.workspaceId}/v/li/${id}`;
      case 'folder':
        return `https://app.clickup.com/t/${this.workspaceId}/v/f/${id}`;
      case 'space':
        return `https://app.clickup.com/t/${this.workspaceId}/v/s/${id}`;
      default:
        return undefined;
    }
  }

  /**
   * Map ClickUp Task to internal document
   */
  mapTask(task: ClickUpTask, listId: string): InternalDocument {
    // Build rich content from task data
    const contentParts: string[] = [];

    // Task description
    if (task.text_content) {
      contentParts.push(task.text_content);
    }

    // Checklists
    if (task.checklists?.length > 0) {
      contentParts.push('\n## Checklists\n');
      for (const checklist of task.checklists) {
        contentParts.push(`\n### ${checklist.name}\n`);
        for (const item of checklist.items) {
          const checked = item.resolved ? '[x]' : '[ ]';
          contentParts.push(`- ${checked} ${item.name}`);
        }
      }
    }

    // Build metadata
    const metadata: Record<string, any> = {
      clickup_id: task.id,
      clickup_custom_id: task.custom_id,
      clickup_url: task.url,
      status: task.status.status,
      status_type: task.status.type,
      priority: task.priority?.priority || null,
      created_at: task.date_created,
      updated_at: task.date_updated,
      closed_at: task.date_closed,
      due_date: task.due_date,
      start_date: task.start_date,
      time_estimate: task.time_estimate,
      time_spent: task.time_spent,
      points: task.points,
      archived: task.archived,
      list_id: listId,
      folder_id: task.folder?.id,
      space_id: task.space?.id,
      parent_task_id: task.parent,
    };

    // Assignees
    if (task.assignees?.length > 0) {
      metadata.assignees = task.assignees.map((u) => ({
        id: u.id,
        username: u.username,
        email: u.email,
      }));
    }

    // Tags
    if (task.tags?.length > 0) {
      metadata.tags = task.tags.map((t) => t.name);
    }

    // Custom fields
    if (task.custom_fields?.length > 0) {
      metadata.custom_fields = task.custom_fields.reduce((acc, field) => {
        if (field.value !== null && field.value !== undefined) {
          acc[field.name] = field.value;
        }
        return acc;
      }, {} as Record<string, any>);
    }

    // Creator
    if (task.creator) {
      metadata.creator = {
        id: task.creator.id,
        username: task.creator.username,
        email: task.creator.email,
      };
    }

    return {
      external_id: task.id,
      external_type: 'clickup_task',
      external_source: 'clickup',
      external_url: task.url || this.buildClickUpUrl('task', task.id),
      external_parent_id: listId,
      external_updated_at: task.date_updated
        ? new Date(parseInt(task.date_updated))
        : undefined,
      title: task.name,
      content: contentParts.join('\n'),
      metadata,
      url: task.url, // Deprecated: kept for backward compatibility
    };
  }

  /**
   * Map ClickUp List to internal document
   */
  mapList(list: ClickUpList, folderId?: string): InternalDocument {
    const metadata: Record<string, any> = {
      clickup_id: list.id,
      task_count: list.task_count,
      archived: list.archived,
      folder_id: folderId || list.folder?.id,
      space_id: list.space?.id,
      due_date: list.due_date,
      start_date: list.start_date,
    };

    // Statuses
    if (list.statuses?.length > 0) {
      metadata.statuses = list.statuses.map((s) => ({
        status: s.status,
        type: s.type,
        color: s.color,
      }));
    }

    return {
      external_id: list.id,
      external_type: 'clickup_list',
      external_source: 'clickup',
      external_url: this.buildClickUpUrl('list', list.id),
      external_parent_id: folderId,
      external_updated_at: list.due_date
        ? new Date(parseInt(list.due_date))
        : undefined,
      title: list.name,
      content: list.content || `ClickUp List: ${list.name}`,
      metadata,
    };
  }

  /**
   * Map ClickUp Folder to internal document
   */
  mapFolder(folder: ClickUpFolder, spaceId: string): InternalDocument {
    const metadata: Record<string, any> = {
      clickup_id: folder.id,
      space_id: spaceId,
      task_count: parseInt(folder.task_count, 10),
      archived: folder.archived,
      hidden: folder.hidden,
    };

    // Statuses
    if (folder.statuses?.length > 0) {
      metadata.statuses = folder.statuses.map((s) => ({
        status: s.status,
        type: s.type,
        color: s.color,
      }));
    }

    return {
      external_id: folder.id,
      external_type: 'clickup_folder',
      external_source: 'clickup',
      external_url: this.buildClickUpUrl('folder', folder.id),
      external_parent_id: spaceId,
      external_updated_at: undefined, // ClickUp API doesn't provide folder updated_at
      title: folder.name,
      content: `ClickUp Folder: ${folder.name}`,
      metadata,
    };
  }

  /**
   * Map ClickUp Space to internal document
   */
  mapSpace(space: ClickUpSpace, workspaceId: string): InternalDocument {
    const metadata: Record<string, any> = {
      clickup_id: space.id,
      workspace_id: workspaceId,
      private: space.private,
      archived: space.archived,
    };

    // Features
    if (space.features) {
      metadata.features = Object.entries(space.features)
        .filter(([_, config]) => config.enabled)
        .map(([name]) => name);
    }

    // Statuses
    if (space.statuses?.length > 0) {
      metadata.statuses = space.statuses.map((s) => ({
        status: s.status,
        type: s.type,
        color: s.color,
      }));
    }

    return {
      external_id: space.id,
      external_type: 'clickup_space',
      external_source: 'clickup',
      external_url: this.buildClickUpUrl('space', space.id),
      external_parent_id: workspaceId,
      external_updated_at: undefined, // ClickUp API doesn't provide space updated_at
      title: space.name,
      content: `ClickUp Space: ${space.name}`,
      metadata,
    };
  }

  /**
   * Map ClickUp Workspace to metadata
   */
  mapWorkspace(workspace: ClickUpWorkspace): Record<string, any> {
    return {
      clickup_id: workspace.id,
      name: workspace.name,
      color: workspace.color,
      avatar: workspace.avatar,
      member_count: workspace.members?.length || 0,
    };
  }

  /**
   * Extract search keywords from task
   */
  extractTaskKeywords(task: ClickUpTask): string[] {
    const keywords: string[] = [];

    // Task name words
    keywords.push(...task.name.toLowerCase().split(/\s+/));

    // Tags
    if (task.tags) {
      keywords.push(...task.tags.map((t) => t.name.toLowerCase()));
    }

    // Status
    keywords.push(task.status.status.toLowerCase());

    // Priority
    if (task.priority) {
      keywords.push(task.priority.priority.toLowerCase());
    }

    // Assignee usernames
    if (task.assignees) {
      keywords.push(...task.assignees.map((a) => a.username.toLowerCase()));
    }

    // Deduplicate and filter short words
    return [...new Set(keywords)].filter((k) => k.length > 2);
  }

  /**
   * Build hierarchical path for a task
   */
  buildTaskPath(task: ClickUpTask): string {
    const parts: string[] = [];

    if (task.space?.id) parts.push(task.space.id);
    if (task.folder?.id && !task.folder.hidden) parts.push(task.folder.id);
    if (task.list?.id) parts.push(task.list.id);
    parts.push(task.id);

    return parts.join('/');
  }

  /**
   * Build ClickUp URL for a doc
   */
  private buildDocUrl(workspaceId: string, docId: string): string {
    return `https://app.clickup.com/${workspaceId}/v/dc/${docId}`;
  }

  /**
   * Map ClickUp Doc to internal document
   *
   * Docs are top-level containers in ClickUp v3 API.
   * They can belong to a space, folder, or list (parent.type = 6, 5, or 4)
   */
  mapDoc(doc: ClickUpDoc): InternalDocument {
    const metadata: Record<string, any> = {
      clickup_id: doc.id,
      workspace_id: doc.workspace_id,
      creator_id: doc.creator_id,
      date_created: doc.date_created,
      date_updated: doc.date_updated,
      archived: doc.archived,
      deleted: doc.deleted,
      protected: doc.protected,
      parent_type: doc.parent.type,
      parent_id: doc.parent.id,
    };

    // Track which space this was imported from (if available)
    if ((doc as any)._imported_from_space_id) {
      metadata.imported_from_space_id = (doc as any)._imported_from_space_id;
    }

    // Avatar (emoji or icon)
    if (doc.avatar) {
      metadata.avatar = doc.avatar.value;
    }

    return {
      external_id: doc.id,
      external_type: 'clickup_doc',
      external_source: 'clickup',
      external_url: this.buildDocUrl(doc.workspace_id, doc.id),
      external_parent_id: doc.parent.id, // Points to space/folder/list
      external_updated_at: new Date(doc.date_updated),
      title: doc.name,
      content: `ClickUp Doc: ${doc.name}`,
      metadata,
    };
  }

  /**
   * Map ClickUp Page to internal document
   *
   * Pages are the actual content within docs.
   * They can be nested (parent_page_id) and contain rich markdown.
   *
   * @param page The page to map
   * @param docId The parent doc ID
   * @param workspaceId The workspace ID for URL construction
   * @param parentDocumentId Optional: Internal document ID of parent page (for hierarchy)
   */
  mapPage(
    page: ClickUpPage,
    docId: string,
    workspaceId: string,
    parentDocumentId?: string
  ): InternalDocument {
    const metadata: Record<string, any> = {
      clickup_page_id: page.page_id,
      clickup_doc_id: docId,
      workspace_id: workspaceId,
      creator_id: page.creator_id,
      date_created: page.date_created,
      date_updated: page.date_updated,
      archived: page.archived,
      protected: page.protected,
    };

    // Parent page reference (for nested pages)
    if (page.parent_page_id) {
      metadata.parent_page_id = page.parent_page_id;
    }

    // Avatar (emoji or icon)
    if (page.avatar) {
      metadata.avatar = page.avatar.value;
    }

    // Cover image
    if (page.cover) {
      metadata.cover = {
        type: page.cover.type,
        value: page.cover.value,
      };
    }

    // Presentation settings (for slides)
    if (page.presentation_details) {
      metadata.presentation_details = page.presentation_details;
    }

    // Build URL: workspace/doc/page
    const pageUrl = `https://app.clickup.com/${workspaceId}/v/dc/${docId}/${page.page_id}`;

    return {
      external_id: page.page_id,
      external_type: 'clickup_page',
      external_source: 'clickup',
      external_url: pageUrl,
      external_parent_id: page.parent_page_id || docId, // Parent page or doc
      external_updated_at: new Date(page.date_updated),
      title: page.name,
      content: page.content || `ClickUp Page: ${page.name}`,
      metadata,
    };
  }
}
