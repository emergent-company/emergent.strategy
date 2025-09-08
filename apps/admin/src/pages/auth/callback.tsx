import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/contexts/auth';
import { parseCallbackParams } from '@/auth/oidc';
import { Icon } from '@/components/ui/Icon';

export default function AuthCallbackPage() {
    const nav = useNavigate();
    const { handleCallback } = useAuth();
    const [error, setError] = useState<string | null>(null);
    const [attempted, setAttempted] = useState(false);
    // Prevent double execution in React 18 StrictMode dev (effects run twice)
    const ranRef = useRef(false);

    useEffect(() => {
        if (ranRef.current) return; // suppress second StrictMode invocation
        ranRef.current = true;
        const { code, error } = parseCallbackParams();
        if (error) {
            setError(error);
            return;
        }
        if (!code) {
            setError('Missing authorization code');
            return;
        }
        (async () => {
            try {
                await handleCallback(code);
                nav('/admin', { replace: true });
            } catch (e: any) {
                const msg = e?.message === 'login_failed' ? 'We could not complete sign-in. Please retry.' : (e?.message || 'Login failed');
                setError(msg);
            }
            setAttempted(true);
        })();
    }, [handleCallback, nav]);

    return (
        <div className="flex justify-center items-center p-6 min-h-screen">
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
                                <button type="button" className="btn btn-primary" onClick={() => nav('/auth/login', { replace: true })}>
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
