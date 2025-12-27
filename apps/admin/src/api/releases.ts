export type ReleaseStatus = 'draft' | 'published';

export interface Release {
  id: string;
  version: string;
  commitCount: number;
  status: ReleaseStatus;
  createdAt: string;
}

export interface ReleaseDetail extends Release {
  fromCommit: string;
  toCommit: string;
  changelogJson: {
    summary?: string;
    features: string[];
    fixes: string[];
    improvements: string[];
  } | null;
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  subject: string;
  body: string;
  authorName: string;
  authorEmail: string;
  date: string;
}

export interface ChangelogItem {
  title: string;
  description?: string;
}

export interface PreviewResponse {
  version: string;
  commitCount: number;
  fromCommit: string;
  toCommit: string;
  commits: GitCommit[];
  changelog: {
    summary: string;
    features: ChangelogItem[];
    improvements: ChangelogItem[];
    bugFixes: ChangelogItem[];
    breakingChanges: ChangelogItem[];
  };
}

export interface CreateReleasePayload {
  fromCommit?: string;
  toCommit?: string;
  since?: string;
  until?: string;
  rawCommits?: boolean;
}

export interface CreateReleaseResponse {
  success: boolean;
  releaseId?: string;
  version?: string;
  error?: string;
}

export interface SendNotificationsPayload {
  userId?: string;
  projectId?: string;
  allUsers?: boolean;
  dryRun?: boolean;
  force?: boolean;
  resend?: boolean;
}

export interface SendNotificationsResponse {
  success: boolean;
  releaseId?: string;
  version?: string;
  recipientCount: number;
  emailsSent: number;
  emailsFailed: number;
  inAppSent: number;
  skippedUsers: number;
  dryRun: boolean;
  error?: string;
}

export interface ReleasesClient {
  listReleases(limit?: number, offset?: number): Promise<Release[]>;
  getRelease(version: string): Promise<ReleaseDetail>;
  getLatestRelease(): Promise<ReleaseDetail>;
  previewRelease(
    since: string,
    until?: string,
    rawCommits?: boolean
  ): Promise<PreviewResponse>;
  createRelease(payload: CreateReleasePayload): Promise<CreateReleaseResponse>;
  sendNotifications(
    version: string,
    payload: SendNotificationsPayload
  ): Promise<SendNotificationsResponse>;
  deleteRelease(version: string): Promise<void>;
}

export function createReleasesClient(
  apiBase: string,
  fetchJson: <T>(
    url: string,
    init?: RequestInit & { body?: unknown }
  ) => Promise<T>
): ReleasesClient {
  return {
    async listReleases(limit = 20, offset = 0) {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      });
      return fetchJson<Release[]>(`${apiBase}/api/releases?${params}`);
    },

    async getRelease(version: string) {
      return fetchJson<ReleaseDetail>(
        `${apiBase}/api/releases/${encodeURIComponent(version)}`
      );
    },

    async getLatestRelease() {
      return fetchJson<ReleaseDetail>(`${apiBase}/api/releases/latest`);
    },

    async previewRelease(since: string, until?: string, rawCommits = true) {
      return fetchJson<PreviewResponse>(`${apiBase}/api/releases/preview`, {
        method: 'POST',
        body: { since, until, rawCommits } as unknown as BodyInit,
      });
    },

    async createRelease(payload: CreateReleasePayload) {
      return fetchJson<CreateReleaseResponse>(`${apiBase}/api/releases`, {
        method: 'POST',
        body: payload as unknown as BodyInit,
      });
    },

    async sendNotifications(
      version: string,
      payload: SendNotificationsPayload
    ) {
      return fetchJson<SendNotificationsResponse>(
        `${apiBase}/api/releases/${encodeURIComponent(version)}/send`,
        {
          method: 'POST',
          body: payload as unknown as BodyInit,
        }
      );
    },

    async deleteRelease(version: string) {
      return fetchJson<void>(
        `${apiBase}/api/releases/${encodeURIComponent(version)}`,
        { method: 'DELETE' }
      );
    },
  };
}
