/**
 * ClickUp API Types
 *
 * Type definitions for ClickUp API responses
 * Based on ClickUp API v2 documentation
 */

/**
 * ClickUp Workspace (Team)
 */
export interface ClickUpWorkspace {
  id: string;
  name: string;
  color?: string;
  avatar?: string;
  members: Array<{
    user: ClickUpUser;
  }>;
}

/**
 * ClickUp User
 */
export interface ClickUpUser {
  id: number;
  username: string;
  email?: string;
  color?: string;
  profilePicture?: string;
}

/**
 * ClickUp Space
 */
export interface ClickUpSpace {
  id: string;
  name: string;
  private: boolean;
  statuses: ClickUpStatus[];
  features: {
    due_dates: { enabled: boolean };
    time_tracking: { enabled: boolean };
    tags: { enabled: boolean };
    time_estimates: { enabled: boolean };
    checklists: { enabled: boolean };
    custom_fields: { enabled: boolean };
    remap_dependencies: { enabled: boolean };
    dependency_warning: { enabled: boolean };
    portfolios: { enabled: boolean };
  };
  archived: boolean;
}

/**
 * ClickUp Folder
 */
export interface ClickUpFolder {
  id: string;
  name: string;
  orderindex: number;
  override_statuses: boolean;
  hidden: boolean;
  space: {
    id: string;
    name: string;
  };
  task_count: string;
  archived: boolean;
  statuses: ClickUpStatus[];
}

/**
 * ClickUp List
 */
export interface ClickUpList {
  id: string;
  name: string;
  orderindex: number;
  content?: string;
  status: ClickUpStatus | null;
  priority: ClickUpPriority | null;
  assignee: ClickUpUser | null;
  task_count: number;
  due_date?: string;
  start_date?: string;
  folder: {
    id: string;
    name: string;
    hidden: boolean;
    access: boolean;
  };
  space: {
    id: string;
    name: string;
    access: boolean;
  };
  archived: boolean;
  override_statuses: boolean;
  statuses: ClickUpStatus[];
}

/**
 * ClickUp Task
 */
export interface ClickUpTask {
  id: string;
  custom_id: string | null;
  name: string;
  text_content: string;
  description: string;
  status: ClickUpStatus;
  orderindex: string;
  date_created: string;
  date_updated: string;
  date_closed: string | null;
  archived: boolean;
  creator: ClickUpUser;
  assignees: ClickUpUser[];
  watchers: ClickUpUser[];
  checklists: ClickUpChecklist[];
  tags: ClickUpTag[];
  parent: string | null;
  priority: ClickUpPriority | null;
  due_date: string | null;
  start_date: string | null;
  points: number | null;
  time_estimate: number | null;
  time_spent: number | null;
  custom_fields: ClickUpCustomField[];
  dependencies: string[];
  linked_tasks: string[];
  team_id: string;
  url: string;
  sharing: {
    public: boolean;
    public_share_expires_on: string | null;
    public_fields: string[];
    token: string | null;
    seo_optimized: boolean;
  };
  permission_level: string;
  list: {
    id: string;
    name: string;
    access: boolean;
  };
  project: {
    id: string;
    name: string;
    hidden: boolean;
    access: boolean;
  };
  folder: {
    id: string;
    name: string;
    hidden: boolean;
    access: boolean;
  };
  space: {
    id: string;
  };
}

/**
 * ClickUp Status
 */
export interface ClickUpStatus {
  id?: string;
  status: string;
  color: string;
  orderindex: number;
  type: 'open' | 'closed' | 'custom';
}

/**
 * ClickUp Priority
 */
export interface ClickUpPriority {
  id: string;
  priority: string;
  color: string;
  orderindex: string;
}

/**
 * ClickUp Tag
 */
export interface ClickUpTag {
  name: string;
  tag_fg: string;
  tag_bg: string;
  creator: number;
}

/**
 * ClickUp Checklist
 */
export interface ClickUpChecklist {
  id: string;
  task_id: string;
  name: string;
  orderindex: number;
  resolved: number;
  unresolved: number;
  items: ClickUpChecklistItem[];
}

/**
 * ClickUp Checklist Item
 */
export interface ClickUpChecklistItem {
  id: string;
  name: string;
  orderindex: number;
  assignee: ClickUpUser | null;
  resolved: boolean;
  parent: string | null;
  date_created: string;
}

/**
 * ClickUp Custom Field
 */
export interface ClickUpCustomField {
  id: string;
  name: string;
  type: string;
  type_config: any;
  date_created: string;
  hide_from_guests: boolean;
  value?: any;
  required: boolean;
}

/**
 * ClickUp Comment
 */
export interface ClickUpComment {
  id: string;
  comment_text: string;
  comment: Array<{
    text: string;
    attributes?: any;
  }>;
  assignee: ClickUpUser | null;
  assigned_by: ClickUpUser | null;
  reactions: any[];
  date: string;
  user: ClickUpUser;
  resolved: boolean;
}

/**
 * ClickUp Webhook Event
 */
export interface ClickUpWebhookEvent {
  event: string;
  task_id?: string;
  list_id?: string;
  folder_id?: string;
  space_id?: string;
  webhook_id: string;
  history_items?: Array<{
    id: string;
    type: number;
    date: string;
    field: string;
    parent_id: string;
    data: any;
    source: string | null;
    user: ClickUpUser;
    before?: any;
    after?: any;
  }>;
}

/**
 * ClickUp API Response Wrappers
 */
export interface ClickUpWorkspacesResponse {
  teams: ClickUpWorkspace[];
}

export interface ClickUpSpacesResponse {
  spaces: ClickUpSpace[];
}

export interface ClickUpFoldersResponse {
  folders: ClickUpFolder[];
}

export interface ClickUpListsResponse {
  lists: ClickUpList[];
}

export interface ClickUpTasksResponse {
  tasks: ClickUpTask[];
  last_page?: boolean;
}

export interface ClickUpCommentsResponse {
  comments: ClickUpComment[];
}

/**
 * ClickUp API v3 Types
 * Types for ClickUp Docs API (v3 endpoints)
 */

/**
 * ClickUp Doc Parent Reference
 * Used to identify where a doc belongs (space, folder, list)
 */
export interface ClickUpDocParent {
  id: string;
  type: number; // 6 = space, 5 = folder, 4 = list
}

/**
 * ClickUp Doc Avatar
 * Can be an emoji or custom icon
 */
export interface ClickUpDocAvatar {
  value: string; // Format: "emoji::📃" or icon reference
}

/**
 * ClickUp Doc Cover Image
 */
export interface ClickUpDocCover {
  type: string; // e.g., "color"
  value: string; // e.g., "#FF6900"
}

/**
 * ClickUp Doc Presentation Settings
 */
export interface ClickUpPresentationSettings {
  slide_size: string; // e.g., "standard"
}

/**
 * ClickUp Doc (from v3 API)
 * Represents a ClickUp Doc with metadata
 */
export interface ClickUpDoc {
  id: string;
  name: string;
  parent: ClickUpDocParent;
  workspace_id: string;
  creator_id: number;
  date_created: string;
  date_updated: string;
  avatar?: ClickUpDocAvatar;
  archived: boolean;
  deleted: boolean;
  protected: boolean;
}

/**
 * ClickUp Page (from v3 API)
 * Represents a page within a ClickUp Doc
 * Pages can have nested child pages (hierarchical structure)
 */
export interface ClickUpPage {
  page_id: string;
  name: string;
  content: string; // Markdown content
  parent_page_id?: string; // If nested, points to parent page
  date_created: string;
  date_updated: string;
  creator_id: number;
  avatar?: ClickUpDocAvatar;
  cover?: ClickUpDocCover;
  presentation_details?: ClickUpPresentationSettings;
  archived: boolean;
  protected: boolean;
  pages?: ClickUpPage[]; // Nested child pages (recursive structure)
}

/**
 * ClickUp API v3 Response Wrappers
 */
export interface ClickUpDocsResponse {
  docs: ClickUpDoc[];
  next_cursor?: string; // For pagination
}

export interface ClickUpDocPagesResponse {
  pages: ClickUpPage[];
}
