// Page: Project Settings - MCP Integration
// Route: /admin/settings/project/mcp

import { useEffect, useState, useCallback } from 'react';
import { useConfig } from '@/contexts/config';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import { PageContainer } from '@/components/layouts';
import {
  type ApiToken,
  type CreateApiTokenResponse,
  type ApiTokenScope,
  API_TOKEN_SCOPES,
} from '@/api/tokens';

// MCP Server endpoint - use API base URL
const getMcpEndpoint = (apiBase: string, projectId: string) => {
  // Convert API URL to MCP endpoint
  const baseUrl = apiBase.replace(/\/api\/v1$/, '').replace(/\/$/, '');
  return `${baseUrl}/mcp/${projectId}`;
};

// Agent configuration templates
const AGENT_CONFIGS = {
  claude: {
    name: 'Claude Desktop',
    icon: 'lucide--bot',
    configPath:
      '~/Library/Application Support/Claude/claude_desktop_config.json',
    getConfig: (endpoint: string, token: string) => ({
      mcpServers: {
        emergent: {
          command: 'npx',
          args: ['-y', 'mcp-remote', endpoint],
          env: {
            MCP_AUTH_TOKEN: token,
          },
        },
      },
    }),
  },
  cursor: {
    name: 'Cursor IDE',
    icon: 'lucide--code',
    configPath: '.cursor/mcp.json (in project root)',
    getConfig: (endpoint: string, token: string) => ({
      mcpServers: {
        emergent: {
          url: endpoint,
          transport: 'sse',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      },
    }),
  },
  cline: {
    name: 'Cline (VS Code)',
    icon: 'lucide--terminal',
    configPath: 'VS Code Settings > Extensions > Cline',
    getConfig: (endpoint: string, token: string) => ({
      mcpServers: {
        emergent: {
          command: 'npx',
          args: ['-y', 'mcp-remote', endpoint],
          env: {
            MCP_AUTH_TOKEN: token,
          },
        },
      },
    }),
  },
  opencode: {
    name: 'OpenCode',
    icon: 'lucide--terminal-square',
    configPath: '.opencode/config.json',
    getConfig: (endpoint: string, token: string) => ({
      mcp: {
        emergent: {
          type: 'sse',
          url: endpoint,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      },
    }),
  },
};

type AgentType = keyof typeof AGENT_CONFIGS;

export default function McpSettingsPage() {
  const { config } = useConfig();
  const { apiBase, fetchJson } = useApi();
  const { showToast } = useToast();

  // Token list state
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create token modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [newTokenScopes, setNewTokenScopes] = useState<ApiTokenScope[]>([
    'schema:read',
    'data:read',
  ]);
  const [creating, setCreating] = useState(false);

  // Token reveal modal state
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  // Config display state
  const [selectedAgent, setSelectedAgent] = useState<AgentType>('claude');
  const [copiedConfig, setCopiedConfig] = useState(false);

  // Revoke confirmation state
  const [tokenToRevoke, setTokenToRevoke] = useState<ApiToken | null>(null);
  const [revoking, setRevoking] = useState(false);

  // Load tokens
  const loadTokens = useCallback(async () => {
    if (!config.activeProjectId) return;

    setLoading(true);
    setError(null);

    try {
      const data = await fetchJson<ApiToken[]>(
        `${apiBase}/projects/${config.activeProjectId}/tokens`
      );
      setTokens(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tokens');
    } finally {
      setLoading(false);
    }
  }, [config.activeProjectId, apiBase, fetchJson]);

  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  // Create token
  const handleCreateToken = async () => {
    if (!config.activeProjectId || !newTokenName.trim()) return;

    setCreating(true);
    try {
      const response = await fetchJson<CreateApiTokenResponse>(
        `${apiBase}/projects/${config.activeProjectId}/tokens`,
        {
          method: 'POST',
          body: {
            name: newTokenName.trim(),
            scopes: newTokenScopes,
          },
        }
      );

      // Show the token reveal modal
      setRevealedToken(response.token);
      setShowCreateModal(false);
      setNewTokenName('');
      setNewTokenScopes(['schema:read', 'data:read']);

      // Refresh token list
      await loadTokens();

      showToast({
        message: 'API token created successfully',
        variant: 'success',
      });
    } catch (err: any) {
      showToast({
        message: err?.error?.message || 'Failed to create token',
        variant: 'error',
      });
    } finally {
      setCreating(false);
    }
  };

  // Revoke token
  const handleRevokeToken = async () => {
    if (!config.activeProjectId || !tokenToRevoke) return;

    setRevoking(true);
    try {
      await fetchJson(
        `${apiBase}/projects/${config.activeProjectId}/tokens/${tokenToRevoke.id}`,
        { method: 'DELETE' }
      );

      setTokenToRevoke(null);
      await loadTokens();

      showToast({
        message: 'Token revoked successfully',
        variant: 'success',
      });
    } catch (err: any) {
      showToast({
        message: err?.error?.message || 'Failed to revoke token',
        variant: 'error',
      });
    } finally {
      setRevoking(false);
    }
  };

  // Copy to clipboard
  const copyToClipboard = async (text: string, type: 'token' | 'config') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'token') {
        setCopiedToken(true);
        setTimeout(() => setCopiedToken(false), 2000);
      } else {
        setCopiedConfig(true);
        setTimeout(() => setCopiedConfig(false), 2000);
      }
    } catch {
      showToast({ message: 'Failed to copy', variant: 'error' });
    }
  };

  // Get MCP endpoint URL
  const mcpEndpoint = config.activeProjectId
    ? getMcpEndpoint(apiBase, config.activeProjectId)
    : '';

  // Get active tokens for config examples
  const activeTokens = tokens.filter((t) => !t.isRevoked);

  // Project gate
  if (!config.activeProjectId) {
    return (
      <PageContainer>
        <div className="alert alert-warning">
          <Icon icon="lucide--alert-circle" />
          <span>Please select a project to configure MCP integration</span>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="4xl" testId="page-mcp-settings">
      {/* Page header */}
      <h1 className="font-semibold text-xl">MCP Integration</h1>
      <p className="mt-2 text-base-content/70">
        Connect AI coding agents to your knowledge base using the Model Context
        Protocol (MCP).
      </p>

      {/* MCP Endpoint Section */}
      <div className="bg-base-100 mt-6 card-border card">
        <div className="card-body">
          <h2 className="card-title text-lg">
            <Icon icon="lucide--link" className="size-5" />
            MCP Endpoint
          </h2>
          <p className="text-sm text-base-content/70">
            Use this endpoint to connect your AI agent to this project.
          </p>

          <div className="mt-4 flex items-center gap-2">
            <code className="flex-1 bg-base-200 px-3 py-2 rounded-lg font-mono text-sm break-all">
              {mcpEndpoint}
            </code>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => copyToClipboard(mcpEndpoint, 'config')}
            >
              <Icon
                icon={copiedConfig ? 'lucide--check' : 'lucide--copy'}
                className="size-4"
              />
            </button>
          </div>
        </div>
      </div>

      {/* API Tokens Section */}
      <div className="bg-base-100 mt-6 card-border card">
        <div className="card-body">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="card-title text-lg">
                <Icon icon="lucide--key" className="size-5" />
                API Tokens
              </h2>
              <p className="text-sm text-base-content/70">
                Create tokens for your AI agents to authenticate with the MCP
                server.
              </p>
            </div>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setShowCreateModal(true)}
            >
              <Icon icon="lucide--plus" className="size-4" />
              Create Token
            </button>
          </div>

          {/* Token list */}
          <div className="mt-4">
            {loading ? (
              <div className="flex justify-center py-8">
                <Spinner size="lg" />
              </div>
            ) : error ? (
              <div className="alert alert-error">
                <Icon icon="lucide--alert-circle" />
                <span>{error}</span>
              </div>
            ) : tokens.length === 0 ? (
              <div className="text-center py-8 text-base-content/70">
                <Icon
                  icon="lucide--key-round"
                  className="size-12 mx-auto mb-2 opacity-50"
                />
                <p>No API tokens yet</p>
                <p className="text-sm">
                  Create a token to connect your AI agent.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Token Prefix</th>
                      <th>Scopes</th>
                      <th>Created</th>
                      <th>Last Used</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {tokens.map((token) => (
                      <tr
                        key={token.id}
                        className={token.isRevoked ? 'opacity-50' : ''}
                      >
                        <td className="font-medium">{token.name}</td>
                        <td>
                          <code className="text-xs bg-base-200 px-1.5 py-0.5 rounded">
                            {token.tokenPrefix}...
                          </code>
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {token.scopes.map((scope) => (
                              <span
                                key={scope}
                                className="badge badge-xs badge-ghost"
                              >
                                {scope}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="text-sm text-base-content/70">
                          {new Date(token.createdAt).toLocaleDateString()}
                        </td>
                        <td className="text-sm text-base-content/70">
                          {token.lastUsedAt
                            ? new Date(token.lastUsedAt).toLocaleDateString()
                            : 'Never'}
                        </td>
                        <td>
                          {token.isRevoked ? (
                            <span className="badge badge-sm badge-error">
                              Revoked
                            </span>
                          ) : (
                            <span className="badge badge-sm badge-success">
                              Active
                            </span>
                          )}
                        </td>
                        <td>
                          {!token.isRevoked && (
                            <button
                              className="btn btn-ghost btn-xs text-error"
                              onClick={() => setTokenToRevoke(token)}
                            >
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Agent Configuration Section */}
      <div className="bg-base-100 mt-6 card-border card">
        <div className="card-body">
          <h2 className="card-title text-lg">
            <Icon icon="lucide--settings" className="size-5" />
            Agent Configuration
          </h2>
          <p className="text-sm text-base-content/70">
            Copy the configuration for your preferred AI agent.
          </p>

          {/* Agent selector tabs */}
          <div role="tablist" className="tabs tabs-boxed mt-4 bg-base-200">
            {(Object.keys(AGENT_CONFIGS) as AgentType[]).map((agent) => (
              <button
                key={agent}
                role="tab"
                className={`tab gap-2 ${
                  selectedAgent === agent ? 'tab-active' : ''
                }`}
                onClick={() => setSelectedAgent(agent)}
              >
                <Icon icon={AGENT_CONFIGS[agent].icon} className="size-4" />
                {AGENT_CONFIGS[agent].name}
              </button>
            ))}
          </div>

          {/* Config display */}
          <div className="mt-4">
            {activeTokens.length === 0 ? (
              <div className="alert alert-warning">
                <Icon icon="lucide--alert-triangle" />
                <span>Create an API token first to see the configuration.</span>
              </div>
            ) : (
              <>
                <div className="text-sm text-base-content/70 mb-2">
                  <strong>Config file:</strong>{' '}
                  <code className="bg-base-200 px-1.5 py-0.5 rounded text-xs">
                    {AGENT_CONFIGS[selectedAgent].configPath}
                  </code>
                </div>
                <div className="relative">
                  <pre className="bg-base-200 p-4 rounded-lg overflow-auto text-sm max-h-64">
                    {JSON.stringify(
                      AGENT_CONFIGS[selectedAgent].getConfig(
                        mcpEndpoint,
                        activeTokens[0].tokenPrefix + '...'
                      ),
                      null,
                      2
                    )}
                  </pre>
                  <button
                    className="absolute top-2 right-2 btn btn-ghost btn-xs"
                    onClick={() =>
                      copyToClipboard(
                        JSON.stringify(
                          AGENT_CONFIGS[selectedAgent].getConfig(
                            mcpEndpoint,
                            '<YOUR_API_TOKEN>'
                          ),
                          null,
                          2
                        ),
                        'config'
                      )
                    }
                  >
                    <Icon
                      icon={copiedConfig ? 'lucide--check' : 'lucide--copy'}
                      className="size-4"
                    />
                    {copiedConfig ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <p className="text-xs text-base-content/60 mt-2">
                  Replace <code>&lt;YOUR_API_TOKEN&gt;</code> with your actual
                  token value.
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Help Section */}
      <div className="mt-6 p-4 bg-base-200 rounded-lg">
        <h3 className="font-medium flex items-center gap-2">
          <Icon icon="lucide--help-circle" className="size-4" />
          Need help?
        </h3>
        <p className="text-sm text-base-content/70 mt-1">
          Visit our{' '}
          <a
            href="https://docs.emergent.ai/mcp"
            target="_blank"
            rel="noopener noreferrer"
            className="link link-primary"
          >
            MCP Integration Guide
          </a>{' '}
          for detailed setup instructions and troubleshooting.
        </p>
      </div>

      {/* Create Token Modal */}
      {showCreateModal && (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Create API Token</h3>
            <p className="text-sm text-base-content/70 mt-1">
              Create a new token for your AI agent to access this project.
            </p>

            <div className="form-control mt-4">
              <label className="label">
                <span className="label-text">Token Name</span>
              </label>
              <input
                type="text"
                className="input input-bordered"
                placeholder="e.g., Claude Desktop"
                value={newTokenName}
                onChange={(e) => setNewTokenName(e.target.value)}
              />
            </div>

            <div className="form-control mt-4">
              <label className="label">
                <span className="label-text">Permissions</span>
              </label>
              <div className="space-y-2">
                {API_TOKEN_SCOPES.map((scope) => (
                  <label
                    key={scope.value}
                    className="flex items-start gap-3 cursor-pointer p-2 rounded-lg hover:bg-base-200"
                  >
                    <input
                      type="checkbox"
                      className="checkbox checkbox-primary mt-0.5"
                      checked={newTokenScopes.includes(scope.value)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setNewTokenScopes([...newTokenScopes, scope.value]);
                        } else {
                          setNewTokenScopes(
                            newTokenScopes.filter((s) => s !== scope.value)
                          );
                        }
                      }}
                    />
                    <div>
                      <div className="font-medium">{scope.label}</div>
                      <div className="text-sm text-base-content/70">
                        {scope.description}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="modal-action">
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setShowCreateModal(false);
                  setNewTokenName('');
                  setNewTokenScopes(['schema:read', 'data:read']);
                }}
                disabled={creating}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCreateToken}
                disabled={
                  creating ||
                  !newTokenName.trim() ||
                  newTokenScopes.length === 0
                }
              >
                {creating ? (
                  <>
                    <Spinner size="xs" />
                    Creating...
                  </>
                ) : (
                  'Create Token'
                )}
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => setShowCreateModal(false)}>close</button>
          </form>
        </dialog>
      )}

      {/* Token Reveal Modal */}
      {revealedToken && (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Icon
                icon="lucide--check-circle"
                className="size-5 text-success"
              />
              Token Created
            </h3>
            <div className="alert alert-warning mt-4">
              <Icon icon="lucide--alert-triangle" />
              <span>
                Copy this token now. You won't be able to see it again.
              </span>
            </div>

            <div className="mt-4">
              <label className="label">
                <span className="label-text font-medium">Your API Token</span>
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-base-200 px-3 py-2 rounded-lg font-mono text-sm break-all select-all">
                  {revealedToken}
                </code>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => copyToClipboard(revealedToken, 'token')}
                >
                  <Icon
                    icon={copiedToken ? 'lucide--check' : 'lucide--copy'}
                    className="size-4"
                  />
                  {copiedToken ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="modal-action">
              <button
                className="btn btn-primary"
                onClick={() => setRevealedToken(null)}
              >
                Done
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => setRevealedToken(null)}>close</button>
          </form>
        </dialog>
      )}

      {/* Revoke Confirmation Modal */}
      {tokenToRevoke && (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Revoke Token</h3>
            <p className="mt-2 text-base-content/70">
              Are you sure you want to revoke the token{' '}
              <strong>"{tokenToRevoke.name}"</strong>? This action cannot be
              undone.
            </p>
            <p className="mt-2 text-sm text-warning">
              Any AI agents using this token will immediately lose access.
            </p>

            <div className="modal-action">
              <button
                className="btn btn-ghost"
                onClick={() => setTokenToRevoke(null)}
                disabled={revoking}
              >
                Cancel
              </button>
              <button
                className="btn btn-error"
                onClick={handleRevokeToken}
                disabled={revoking}
              >
                {revoking ? (
                  <>
                    <Spinner size="xs" />
                    Revoking...
                  </>
                ) : (
                  'Revoke Token'
                )}
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => setTokenToRevoke(null)}>close</button>
          </form>
        </dialog>
      )}
    </PageContainer>
  );
}
