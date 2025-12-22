export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface UserOrgMembership {
  orgId: string;
  orgName: string;
  role: string;
  joinedAt: string;
}

export interface SuperadminUser {
  id: string;
  zitadelUserId: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  primaryEmail: string | null;
  lastActivityAt: string | null;
  createdAt: string;
  organizations: UserOrgMembership[];
}

export interface ListUsersResponse {
  users: SuperadminUser[];
  meta: PaginationMeta;
}

export interface ListUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  orgId?: string;
}

export interface SuperadminOrg {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  projectCount: number;
  createdAt: string;
}

export interface ListOrgsResponse {
  organizations: SuperadminOrg[];
  meta: PaginationMeta;
}

export interface ViewAsState {
  active: boolean;
  targetUserId: string | null;
  targetUserEmail: string | null;
  targetUserName: string | null;
}
