// API client for API Tokens
// Used by MCP Settings page for token management

export interface ApiToken {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: ApiTokenScope[];
  createdAt: string;
  lastUsedAt: string | null;
  isRevoked: boolean;
}

export interface CreateApiTokenResponse extends ApiToken {
  token: string; // Raw token - only returned at creation time
}

export type ApiTokenScope = 'schema:read' | 'data:read' | 'data:write';

export interface CreateApiTokenRequest {
  name: string;
  scopes: ApiTokenScope[];
}

// Scope metadata for display
export const API_TOKEN_SCOPES: {
  value: ApiTokenScope;
  label: string;
  description: string;
}[] = [
  {
    value: 'schema:read',
    label: 'Schema Read',
    description: 'Read schema definitions and type information',
  },
  {
    value: 'data:read',
    label: 'Data Read',
    description: 'Read graph objects and relationships',
  },
  {
    value: 'data:write',
    label: 'Data Write',
    description: 'Create and update graph objects and relationships',
  },
];
