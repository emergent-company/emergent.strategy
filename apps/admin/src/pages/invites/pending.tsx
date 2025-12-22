// Pending invitations page
// Shows pending invitations for new users who don't have an organization yet
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useAuth } from '@/contexts/useAuth';
import { useAccessTreeContext } from '@/contexts/access-tree';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';

interface PendingInvite {
  id: string;
  projectId?: string;
  projectName?: string;
  organizationId: string;
  organizationName?: string;
  role: string;
  token: string;
  createdAt: string;
  expiresAt?: string;
}

export default function PendingInvitationsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { getAccessToken } = useAuth();
  const { refresh: refreshAccessTree } = useAccessTreeContext();

  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Fetch pending invitations
  const fetchInvites = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setError('Not authenticated');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/invites/pending', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch invitations: ${response.status}`);
      }

      const data = await response.json();
      setInvites(data);
    } catch (err) {
      console.error('Error fetching invites:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to load invitations'
      );
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    void fetchInvites();
  }, [fetchInvites]);

  // Accept an invitation
  const handleAccept = async (invite: PendingInvite) => {
    setProcessingId(invite.id);
    setError(null);

    const token = getAccessToken();
    if (!token) {
      setError('Not authenticated');
      setProcessingId(null);
      return;
    }

    try {
      const response = await fetch('/api/invites/accept', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: invite.token }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          data.error?.message ||
            `Failed to accept invitation: ${response.status}`
        );
      }

      // Remove from list
      setInvites((prev) => prev.filter((i) => i.id !== invite.id));

      // Refresh the access tree to pick up new org/project membership
      await refreshAccessTree();

      // If no more invites, redirect to admin
      const remaining = invites.filter((i) => i.id !== invite.id);
      if (remaining.length === 0) {
        // Navigate to admin - the SetupGuard will handle org/project selection
        const returnTo =
          (location.state as { returnTo?: string })?.returnTo || '/admin';
        navigate(returnTo, { replace: true });
      }
    } catch (err) {
      console.error('Error accepting invite:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to accept invitation'
      );
    } finally {
      setProcessingId(null);
    }
  };

  // Decline an invitation
  const handleDecline = async (invite: PendingInvite) => {
    setProcessingId(invite.id);
    setError(null);

    const token = getAccessToken();
    if (!token) {
      setError('Not authenticated');
      setProcessingId(null);
      return;
    }

    try {
      const response = await fetch(`/api/invites/${invite.id}/decline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          data.error?.message ||
            `Failed to decline invitation: ${response.status}`
        );
      }

      // Remove from list
      setInvites((prev) => prev.filter((i) => i.id !== invite.id));

      // If no more invites, redirect to org setup
      const remaining = invites.filter((i) => i.id !== invite.id);
      if (remaining.length === 0) {
        navigate('/setup/organization', { replace: true });
      }
    } catch (err) {
      console.error('Error declining invite:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to decline invitation'
      );
    } finally {
      setProcessingId(null);
    }
  };

  // Skip all and create own org
  const handleSkipAll = () => {
    navigate('/setup/organization', { replace: true });
  };

  // Format role for display
  const formatRole = (role: string) => {
    switch (role) {
      case 'org_admin':
        return 'Organization Admin';
      case 'project_admin':
        return 'Project Admin';
      case 'project_user':
        return 'Project Member';
      default:
        return role;
    }
  };

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Spinner size="lg" />
      </div>
    );
  }

  // If no invites, redirect to org setup
  if (!loading && invites.length === 0) {
    navigate('/setup/organization', { replace: true });
    // Return loading spinner while redirect happens
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex justify-center items-center bg-base-200 p-4 min-h-screen">
      <div className="w-full max-w-2xl">
        <div className="bg-base-100 shadow-xl border border-base-300 card">
          <div className="space-y-6 card-body">
            {/* Header */}
            <div className="text-center">
              <div className="inline-flex bg-primary/10 mb-4 p-3 rounded-full">
                <Icon
                  icon="lucide--mail-open"
                  className="size-8 text-primary"
                />
              </div>
              <h1 className="justify-center font-bold text-2xl card-title">
                You have pending invitations
              </h1>
              <p className="mt-2 text-base-content/70">
                Accept an invitation to join an existing organization, or skip
                to create your own.
              </p>
            </div>

            {/* Error message */}
            {error && (
              <div role="alert" className="alert alert-error">
                <Icon icon="lucide--alert-circle" className="size-5" />
                <span>{error}</span>
              </div>
            )}

            {/* Invitations list */}
            <div className="space-y-3">
              {invites.map((invite) => (
                <div
                  key={invite.id}
                  className="bg-base-200 p-4 border rounded-lg border-base-300"
                >
                  <div className="flex sm:flex-row flex-col justify-between items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Icon
                          icon={
                            invite.projectId
                              ? 'lucide--folder'
                              : 'lucide--building-2'
                          }
                          className="flex-shrink-0 size-5 text-base-content/70"
                        />
                        <span className="font-semibold truncate">
                          {invite.projectName ||
                            invite.organizationName ||
                            'Unknown'}
                        </span>
                      </div>
                      {invite.projectId && invite.organizationName && (
                        <p className="mt-1 text-base-content/60 text-sm">
                          in {invite.organizationName}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className="badge badge-outline badge-sm">
                          {formatRole(invite.role)}
                        </span>
                        <span className="text-base-content/50 text-xs">
                          Invited {formatDate(invite.createdAt)}
                        </span>
                        {invite.expiresAt && (
                          <span className="text-warning text-xs">
                            Expires {formatDate(invite.expiresAt)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                      <button
                        className="flex-1 sm:flex-none btn btn-ghost btn-sm"
                        onClick={() => handleDecline(invite)}
                        disabled={processingId === invite.id}
                      >
                        {processingId === invite.id ? (
                          <Spinner size="xs" />
                        ) : (
                          'Decline'
                        )}
                      </button>
                      <button
                        className="flex-1 sm:flex-none btn btn-primary btn-sm"
                        onClick={() => handleAccept(invite)}
                        disabled={processingId === invite.id}
                      >
                        {processingId === invite.id ? (
                          <Spinner size="xs" />
                        ) : (
                          'Accept'
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Divider */}
            <div className="divider text-base-content/50 text-sm">or</div>

            {/* Skip option */}
            <div className="text-center">
              <button
                className="btn btn-outline btn-sm"
                onClick={handleSkipAll}
                disabled={!!processingId}
              >
                Skip and create my own organization
              </button>
              <p className="mt-2 text-base-content/50 text-xs">
                You can always accept invitations later from Settings
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
