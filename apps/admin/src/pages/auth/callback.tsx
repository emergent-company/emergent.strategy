import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/contexts/useAuth';
import { parseCallbackParams, hasValidCodeVerifier } from '@/auth/oidc';
import { Icon } from '@/components/atoms/Icon';

export default function AuthCallbackPage() {
  const nav = useNavigate();
  const { handleCallback, beginLogin } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  // Prevent double execution in React 18 StrictMode dev (effects run twice)
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return; // suppress second StrictMode invocation
    ranRef.current = true;
    console.log('[AuthCallback] Page loaded, parsing callback params');
    const { code, error } = parseCallbackParams();
    console.log('[AuthCallback] Parsed params', { hasCode: !!code, error });

    // Check for missing code_verifier early - if missing, the session expired
    // and we should restart the auth flow automatically
    if (code && !hasValidCodeVerifier()) {
      console.log(
        '[AuthCallback] Session expired (missing code_verifier), restarting auth flow'
      );
      // Clear the stale code from URL and restart login
      window.history.replaceState({}, '', window.location.pathname);
      beginLogin();
      return;
    }

    if (error) {
      console.error('[AuthCallback] OAuth error in callback URL', { error });
      setError(error);
      return;
    }
    if (!code) {
      console.error(
        '[AuthCallback] Missing authorization code in callback URL'
      );
      setError('Missing authorization code');
      return;
    }
    (async () => {
      try {
        console.log('[AuthCallback] Calling handleCallback with code');
        await handleCallback(code);
        console.log(
          '[AuthCallback] handleCallback succeeded, verifying localStorage'
        );

        // Verify localStorage write completed
        const authData = localStorage.getItem('spec-server-auth');
        console.log('[AuthCallback] localStorage verification', {
          hasAuthData: !!authData,
          dataLength: authData?.length || 0,
        });

        if (!authData) {
          console.error('[AuthCallback] CRITICAL: localStorage write failed!');
          throw new Error('Failed to save authentication state');
        }

        // Small delay to ensure all state updates complete
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Check for stored invitation return URL (from /invites/accept page)
        const inviteReturnUrl = sessionStorage.getItem('invite-return-url');
        if (inviteReturnUrl) {
          console.log(
            '[AuthCallback] Found invite return URL, redirecting:',
            inviteReturnUrl
          );
          // Clear the stored URL
          sessionStorage.removeItem('invite-return-url');
          // Navigate to the invite acceptance page (preserves ?token=XXX)
          const url = new URL(inviteReturnUrl);
          nav(url.pathname + url.search, { replace: true });
          return;
        }

        console.log('[AuthCallback] Navigating to /admin');
        nav('/admin', { replace: true });
      } catch (e: any) {
        console.error('[AuthCallback] handleCallback failed', {
          error: e,
          message: e?.message,
          stack: e?.stack,
        });
        let msg: string;
        if (e?.message === 'login_failed') {
          msg = 'We could not complete sign-in. Please retry.';
        } else if (e?.message === 'session_expired') {
          // code_verifier was missing - session storage cleared (tab closed, browser restart, etc.)
          msg = 'Your login session expired. Please sign in again.';
        } else {
          msg = e?.message || 'Login failed';
        }
        setError(msg);
      }
      setAttempted(true);
    })();
  }, [handleCallback, nav, beginLogin]);

  return (
    <div
      data-testid="page-auth-callback"
      className="flex justify-center items-center p-6 min-h-screen"
    >
      <div className="w-full max-w-sm card">
        <div className="items-center card-body">
          {!error ? (
            <>
              <span className="loading loading-bars loading-lg" />
              <div className="mt-4">Signing you in…</div>
            </>
          ) : (
            <div className="flex flex-col gap-4 w-full">
              <div role="alert" className="alert alert-error">
                <Icon icon="lucide--alert-triangle" ariaLabel="Error" />
                <span>{error}</span>
              </div>
              {attempted && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => nav('/auth/login', { replace: true })}
                >
                  Retry
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
