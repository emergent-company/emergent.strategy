export interface Notification {
  id: string;
  project_id: string | null;
  subject_id: string;
  category: string;
  importance: 'important' | 'other';
  title: string;
  message: string;
  details: Record<string, any> | null;
  source_type: string | null;
  source_id: string | null;
  action_url: string | null;
  action_label: string | null;
  read_at: Date | null;
  cleared_at: Date | null;
  snoozed_until: Date | null;
  group_key: string | null;
  created_at: Date;
  // New fields from migration 0005
  type: string | null;
  severity: 'info' | 'success' | 'warning' | 'error';
  related_resource_type: string | null;
  related_resource_id: string | null;
  read: boolean;
  dismissed: boolean;
  dismissed_at: Date | null;
  actions: Array<{
    label: string;
    url: string;
    style?: 'primary' | 'secondary' | 'warning' | 'danger';
  }>;
  expires_at: Date | null;
}

export interface NotificationPreferences {
  id: string;
  subject_id: string;
  category: string;
  in_app_enabled: boolean;
  email_enabled: boolean;
  email_digest: boolean;
  force_important: boolean;
  force_other: boolean;
  auto_mark_read: boolean;
  auto_clear_after_days: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface UnreadCounts {
  important: number;
  other: number;
  snoozed: number;
}

export interface NotificationFilter {
  category?: string;
  unread_only?: boolean;
  search?: string;
}

export type NotificationTab = 'important' | 'other' | 'snoozed' | 'cleared';
