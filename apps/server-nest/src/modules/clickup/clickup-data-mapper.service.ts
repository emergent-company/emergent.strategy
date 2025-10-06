import { Injectable, Logger } from '@nestjs/common';
import {
    ClickUpTask,
    ClickUpList,
    ClickUpFolder,
    ClickUpSpace,
    ClickUpWorkspace,
} from './clickup.types';

/**
 * Internal Document Type
 * 
 * Simplified representation for mapping external data
 * Includes source tracking metadata per spec/22-clickup-integration.md section 3.3.1
 */
interface InternalDocument {
    external_id: string;
    external_type: string;
    external_source: string; // Always "clickup" for this integration
    external_url?: string; // Direct link to ClickUp object
    external_parent_id?: string; // Parent object's external ID
    external_updated_at?: Date; // Last modified in ClickUp
    title: string;
    content: string;
    metadata: Record<string, any>;
    url?: string; // Deprecated: use external_url instead
}

/**
 * ClickUp Data Mapper Service
 * 
 * Maps ClickUp entities to internal knowledge base structure.
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
     * Based on patterns from spec/22-clickup-integration.md section 3.3.1
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
            metadata.assignees = task.assignees.map(u => ({
                id: u.id,
                username: u.username,
                email: u.email,
            }));
        }

        // Tags
        if (task.tags?.length > 0) {
            metadata.tags = task.tags.map(t => t.name);
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
            external_updated_at: task.date_updated ? new Date(parseInt(task.date_updated)) : undefined,
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
            metadata.statuses = list.statuses.map(s => ({
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
            external_updated_at: list.due_date ? new Date(parseInt(list.due_date)) : undefined,
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
            metadata.statuses = folder.statuses.map(s => ({
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
            metadata.statuses = space.statuses.map(s => ({
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
            keywords.push(...task.tags.map(t => t.name.toLowerCase()));
        }

        // Status
        keywords.push(task.status.status.toLowerCase());

        // Priority
        if (task.priority) {
            keywords.push(task.priority.priority.toLowerCase());
        }

        // Assignee usernames
        if (task.assignees) {
            keywords.push(...task.assignees.map(a => a.username.toLowerCase()));
        }

        // Deduplicate and filter short words
        return [...new Set(keywords)].filter(k => k.length > 2);
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
}
