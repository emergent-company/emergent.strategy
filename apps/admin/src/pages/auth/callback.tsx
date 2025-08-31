import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/contexts/auth';
import { parseCallbackParams } from '@/auth/oidc';
import { Icon } from '@/components/ui/Icon';

export default function AuthCallbackPage() {
    const nav = useNavigate();
    const { handleCallback } = useAuth();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
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
                setError(e?.message || 'Login failed');
            }
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
                        <div role="alert" className="alert alert-error">
                            <Icon icon="lucide--alert-triangle" ariaLabel="Error" />
                            <span>{error}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
