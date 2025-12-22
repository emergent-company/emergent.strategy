// Invitation acceptance page
// Handles the invitation link from emails: /invites/accept?token=XXX
//
// Flow:
// 1. Extract token from URL
// 2. If not authenticated, redirect to Zitadel login with return URL
// 3. If authenticated, validate token and show acceptance UI
// 4. On accept, call API and redirect to dashboard

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '@/contexts/useAuth';
import { useAccessTreeContext } from '@/contexts/access-tree';
import { useApi } from '@/hooks/use-api';
import { Icon } from '@/components/atoms/Icon';
import { MetaData } from '@/components/atoms/MetaData';
import { Spinner } from '@/components/atoms/Spinner';

interface InviteDetails {
  id: string;
  token: string;
  projectId?: string;
  projectName?: string;
  organizationId: string;
  organizationName?: string;
  role: string;
  email: string;
  expiresAt?: string;
  status: string;
}

export default function AcceptInvitationPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, isInitialized, beginLogin, getAccessToken } =
    useAuth();
  const { refresh: refreshAccessTree } = useAccessTreeContext();
  const { apiBase, fetchJson } = useApi();

  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [declined, setDeclined] = useState(false);

  // Track if we've already initiated login to prevent loops
  const loginInitiatedRef = useRef(false);

  // Validate the invitation token (public endpoint)
  const validateToken = useCallback(async () => {
    if (!token) {
      setError('No invitation token provided');
      setLoading(false);
      return;
    }

    const accessToken = getAccessToken();
    if (!accessToken) {
      setLoading(false);
      return;
    }

    try {
      // First get pending invites and find the one with matching token
      const pendingInvites = await fetchJson<InviteDetails[]>(
        `${apiBase}/api/invites/pending`
      );

      const matchingInvite = pendingInvites?.find((inv) => inv.token === token);

      if (matchingInvite) {
        setInvite(matchingInvite);
      } else {
        // Token not found in pending invites - might be expired, already used, or invalid
        setError(
          'This invitation is no longer valid. It may have expired or already been used.'
        );
      }
    } catch (err) {
      console.error('Failed to validate invitation:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to validate invitation'
      );
    } finally {
      setLoading(false);
    }
  }, [token, getAccessToken, apiBase, fetchJson]);

  // Handle authentication redirect
  useEffect(() => {
    if (!isInitialized) return;

    if (!isAuthenticated && !loginInitiatedRef.current) {
      // Store the current URL so we can return after authentication
      const returnUrl = window.location.href;
      sessionStorage.setItem('invite-return-url', returnUrl);

      console.log('[AcceptInvitation] Not authenticated, redirecting to login');
      loginInitiatedRef.current = true;
      void beginLogin();
    }
  }, [isAuthenticated, isInitialized, beginLogin]);

  // Validate token once authenticated
  useEffect(() => {
    if (isAuthenticated && token) {
      void validateToken();
    }
  }, [isAuthenticated, token, validateToken]);

  // Accept the invitation
  const handleAccept = async () => {
    if (!token) return;

    setAccepting(true);
    setError(null);

    try {
      await fetchJson(`${apiBase}/api/invites/accept`, {
        method: 'POST',
        body: { token },
      });

      // Refresh access tree to get new org/project
      await refreshAccessTree();

      // Clear the stored return URL
      sessionStorage.removeItem('invite-return-url');

      // Navigate to the admin dashboard
      navigate('/admin', { replace: true });
    } catch (err) {
      console.error('Failed to accept invitation:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to accept invitation'
      );
    } finally {
      setAccepting(false);
    }
  };

  // Decline the invitation
  const handleDecline = async () => {
    if (!invite) return;

    setAccepting(true);
    setError(null);

    try {
      await fetchJson(`${apiBase}/api/invites/${invite.id}/decline`, {
        method: 'POST',
      });

      setDeclined(true);
    } catch (err) {
      console.error('Failed to decline invitation:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to decline invitation'
      );
    } finally {
      setAccepting(false);
    }
  };

  // Continue to dashboard after declining
  const handleContinue = () => {
    sessionStorage.removeItem('invite-return-url');
    navigate('/admin', { replace: true });
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

  // Show loading while initializing or checking auth
  if (!isInitialized || (!isAuthenticated && !error)) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <MetaData title="Accept Invitation" />
        <div className="text-center">
          <Spinner size="lg" />
          <p className="mt-4 text-base-content/70">
            {!isInitialized ? 'Loading...' : 'Redirecting to sign in...'}
          </p>
        </div>
      </div>
    );
  }

  // Show loading while validating token
  if (loading && isAuthenticated) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <MetaData title="Accept Invitation" />
        <div className="text-center">
          <Spinner size="lg" />
          <p className="mt-4 text-base-content/70">Validating invitation...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error && !invite) {
    return (
      <div className="flex justify-center items-center bg-base-200 p-4 min-h-screen">
        <MetaData title="Invalid Invitation" />
        <div className="w-full max-w-md">
          <div className="bg-base-100 shadow-xl border border-base-300 card">
            <div className="space-y-4 card-body">
              <div className="text-center">
                <div className="inline-flex bg-error/10 mb-4 p-3 rounded-full">
                  <Icon
                    icon="lucide--alert-circle"
                    className="size-8 text-error"
                  />
                </div>
                <h1 className="justify-center font-bold text-xl card-title">
                  Invalid Invitation
                </h1>
              </div>

              <div role="alert" className="alert alert-error">
                <Icon icon="lucide--x-circle" className="size-5" />
                <span>{error}</span>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  className="btn btn-primary"
                  onClick={() => navigate('/admin', { replace: true })}
                >
                  Go to Dashboard
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => navigate('/auth/login', { replace: true })}
                >
                  Sign in with a different account
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show declined confirmation
  if (declined) {
    return (
      <div className="flex justify-center items-center bg-base-200 p-4 min-h-screen">
        <MetaData title="Invitation Declined" />
        <div className="w-full max-w-md">
          <div className="bg-base-100 shadow-xl border border-base-300 card">
            <div className="space-y-4 card-body">
              <div className="text-center">
                <div className="inline-flex bg-base-200 mb-4 p-3 rounded-full">
                  <Icon
                    icon="lucide--check"
                    className="size-8 text-base-content"
                  />
                </div>
                <h1 className="justify-center font-bold text-xl card-title">
                  Invitation Declined
                </h1>
                <p className="mt-2 text-base-content/70">
                  You have declined the invitation to join{' '}
                  {invite?.projectName || invite?.organizationName}.
                </p>
              </div>

              <button
                className="btn btn-primary w-full"
                onClick={handleContinue}
              >
                Continue to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show invitation acceptance UI
  return (
    <div className="flex justify-center items-center bg-base-200 p-4 min-h-screen">
      <MetaData title="Accept Invitation" />
      <div className="w-full max-w-lg">
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
                You're Invited!
              </h1>
              <p className="mt-2 text-base-content/70">
                You've been invited to join a{' '}
                {invite?.projectId ? 'project' : 'organization'}
              </p>
            </div>

            {/* Error message */}
            {error && (
              <div role="alert" className="alert alert-error">
                <Icon icon="lucide--alert-circle" className="size-5" />
                <span>{error}</span>
              </div>
            )}

            {/* Invitation details */}
            {invite && (
              <div className="bg-base-200 p-4 border rounded-lg border-base-300">
                <div className="space-y-3">
                  {/* Organization */}
                  <div className="flex items-center gap-3">
                    <Icon
                      icon="lucide--building-2"
                      className="size-5 text-base-content/70"
                    />
                    <div>
                      <div className="text-sm text-base-content/60">
                        Organization
                      </div>
                      <div className="font-medium">
                        {invite.organizationName || 'Unknown Organization'}
                      </div>
                    </div>
                  </div>

                  {/* Project (if project invite) */}
                  {invite.projectId && (
                    <div className="flex items-center gap-3">
                      <Icon
                        icon="lucide--folder"
                        className="size-5 text-base-content/70"
                      />
                      <div>
                        <div className="text-sm text-base-content/60">
                          Project
                        </div>
                        <div className="font-medium">
                          {invite.projectName || 'Unknown Project'}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Role */}
                  <div className="flex items-center gap-3">
                    <Icon
                      icon="lucide--shield"
                      className="size-5 text-base-content/70"
                    />
                    <div>
                      <div className="text-sm text-base-content/60">Role</div>
                      <div className="font-medium">
                        {formatRole(invite.role)}
                      </div>
                    </div>
                  </div>

                  {/* Expiration */}
                  {invite.expiresAt && (
                    <div className="flex items-center gap-3">
                      <Icon
                        icon="lucide--clock"
                        className="size-5 text-base-content/70"
                      />
                      <div>
                        <div className="text-sm text-base-content/60">
                          Expires
                        </div>
                        <div className="font-medium">
                          {new Date(invite.expiresAt).toLocaleDateString(
                            'en-US',
                            {
                              weekday: 'long',
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                            }
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-3">
              <button
                className="btn btn-primary"
                onClick={handleAccept}
                disabled={accepting}
              >
                {accepting ? (
                  <Spinner size="sm" />
                ) : (
                  <>
                    <Icon icon="lucide--check" className="size-4" />
                    Accept Invitation
                  </>
                )}
              </button>
              <button
                className="btn btn-ghost"
                onClick={handleDecline}
                disabled={accepting}
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
