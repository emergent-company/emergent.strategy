import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router';
import { MetaData } from '@/components/atoms/MetaData';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import { ProductTopbar } from '@/components/organisms/ProductTopbar';
import { Footer } from '@/pages/landing/components/Footer';

interface EmailPreferences {
  releaseEmailsEnabled: boolean;
  marketingEmailsEnabled: boolean;
}

interface UnsubscribeInfo {
  maskedEmail: string;
  currentPreferences: EmailPreferences;
}

interface UnsubscribeResponse {
  success: boolean;
  message: string;
  updatedPreferences: EmailPreferences;
}

type EmailType = 'release' | 'marketing' | 'all';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export default function UnsubscribePage() {
  const { token } = useParams<{ token: string }>();

  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<UnsubscribeInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchPreferences = useCallback(async () => {
    if (!token) {
      setError('Invalid unsubscribe link');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/unsubscribe/${token}`);

      if (response.status === 404) {
        setError('This unsubscribe link is invalid or has expired.');
        setLoading(false);
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to load preferences');
      }

      const data: UnsubscribeInfo = await response.json();
      setInfo(data);
    } catch (err) {
      console.error('Failed to fetch unsubscribe info:', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load your email preferences'
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchPreferences();
  }, [fetchPreferences]);

  const handleUnsubscribe = async (emailType: EmailType) => {
    if (!token) return;

    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`${API_BASE}/api/unsubscribe/${token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ emailType }),
      });

      if (response.status === 404) {
        setError('This unsubscribe link is invalid or has expired.');
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to update preferences');
      }

      const data: UnsubscribeResponse = await response.json();

      if (data.success) {
        setSuccessMessage(data.message);
        setInfo((prev) =>
          prev
            ? {
                ...prev,
                currentPreferences: data.updatedPreferences,
              }
            : null
        );
      } else {
        setError(data.message || 'Failed to update preferences');
      }
    } catch (err) {
      console.error('Failed to unsubscribe:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to update preferences'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetry = () => {
    setError(null);
    setLoading(true);
    void fetchPreferences();
  };

  const PreferenceIcon = ({ enabled }: { enabled: boolean }) =>
    enabled ? (
      <Icon icon="lucide--check" className="size-5 text-success" />
    ) : (
      <Icon icon="lucide--x" className="size-5 text-error" />
    );

  if (loading) {
    return (
      <div data-testid="page-unsubscribe">
        <MetaData title="Email Preferences | Emergent" />
        <ProductTopbar />
        <main className="min-h-screen bg-base-100">
          <div className="container mx-auto px-4 py-12 max-w-lg">
            <div className="flex justify-center items-center py-12">
              <Spinner size="lg" />
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (error && !info) {
    return (
      <div data-testid="page-unsubscribe">
        <MetaData title="Email Preferences | Emergent" />
        <ProductTopbar />
        <main className="min-h-screen bg-base-100">
          <div className="container mx-auto px-4 py-12 max-w-lg">
            <div className="card bg-base-100 shadow-xl border border-base-300">
              <div className="card-body space-y-4">
                <div className="text-center">
                  <div className="inline-flex bg-error/10 mb-4 p-3 rounded-full">
                    <Icon
                      icon="lucide--alert-circle"
                      className="size-8 text-error"
                    />
                  </div>
                  <h1 className="card-title justify-center font-bold text-xl">
                    Invalid Link
                  </h1>
                </div>

                <div role="alert" className="alert alert-error">
                  <Icon icon="lucide--x-circle" className="size-5" />
                  <span>{error}</span>
                </div>

                <button
                  className="btn btn-outline w-full"
                  onClick={handleRetry}
                >
                  <Icon icon="lucide--refresh-cw" className="size-4" />
                  Try Again
                </button>
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div data-testid="page-unsubscribe">
      <MetaData title="Email Preferences | Emergent" />
      <ProductTopbar />
      <main className="min-h-screen bg-base-100">
        <div className="container mx-auto px-4 py-12 max-w-lg">
          <div className="card bg-base-100 shadow-xl border border-base-300">
            <div className="card-body space-y-6">
              {/* Header */}
              <div className="text-center">
                <div className="inline-flex bg-primary/10 mb-4 p-3 rounded-full">
                  <Icon icon="lucide--mail" className="size-8 text-primary" />
                </div>
                <h1 className="card-title justify-center font-bold text-2xl">
                  Email Preferences
                </h1>
                {info && (
                  <p className="mt-2 text-base-content/70">
                    Managing preferences for{' '}
                    <span className="font-medium">{info.maskedEmail}</span>
                  </p>
                )}
              </div>

              {/* Success message */}
              {successMessage && (
                <div role="alert" className="alert alert-success">
                  <Icon icon="lucide--check-circle" className="size-5" />
                  <span>{successMessage}</span>
                </div>
              )}

              {/* Error message */}
              {error && (
                <div role="alert" className="alert alert-error">
                  <Icon icon="lucide--alert-circle" className="size-5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Current preferences */}
              {info && (
                <div className="bg-base-200 p-4 border rounded-lg border-base-300">
                  <h2 className="font-semibold mb-3">Current Preferences</h2>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon
                          icon="lucide--rocket"
                          className="size-5 text-base-content/70"
                        />
                        <span>Release Notes & Updates</span>
                      </div>
                      <PreferenceIcon
                        enabled={info.currentPreferences.releaseEmailsEnabled}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon
                          icon="lucide--megaphone"
                          className="size-5 text-base-content/70"
                        />
                        <span>Marketing & Announcements</span>
                      </div>
                      <PreferenceIcon
                        enabled={info.currentPreferences.marketingEmailsEnabled}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Unsubscribe buttons */}
              {info && (
                <div className="space-y-3">
                  <h2 className="font-semibold">Unsubscribe Options</h2>

                  {info.currentPreferences.releaseEmailsEnabled && (
                    <button
                      className="btn btn-outline w-full"
                      onClick={() => handleUnsubscribe('release')}
                      disabled={submitting}
                    >
                      {submitting ? (
                        <Spinner size="sm" />
                      ) : (
                        <>
                          <Icon icon="lucide--rocket" className="size-4" />
                          Unsubscribe from Release Emails
                        </>
                      )}
                    </button>
                  )}

                  {info.currentPreferences.marketingEmailsEnabled && (
                    <button
                      className="btn btn-outline w-full"
                      onClick={() => handleUnsubscribe('marketing')}
                      disabled={submitting}
                    >
                      {submitting ? (
                        <Spinner size="sm" />
                      ) : (
                        <>
                          <Icon icon="lucide--megaphone" className="size-4" />
                          Unsubscribe from Marketing Emails
                        </>
                      )}
                    </button>
                  )}

                  {(info.currentPreferences.releaseEmailsEnabled ||
                    info.currentPreferences.marketingEmailsEnabled) && (
                    <button
                      className="btn btn-primary w-full"
                      onClick={() => handleUnsubscribe('all')}
                      disabled={submitting}
                    >
                      {submitting ? (
                        <Spinner size="sm" />
                      ) : (
                        <>
                          <Icon icon="lucide--mail-x" className="size-4" />
                          Unsubscribe from All Emails
                        </>
                      )}
                    </button>
                  )}

                  {!info.currentPreferences.releaseEmailsEnabled &&
                    !info.currentPreferences.marketingEmailsEnabled && (
                      <div className="text-center py-4 text-base-content/70">
                        <Icon
                          icon="lucide--check-circle"
                          className="size-8 mx-auto mb-2 text-success"
                        />
                        <p>
                          You are already unsubscribed from all optional emails.
                        </p>
                      </div>
                    )}
                </div>
              )}

              {/* Footer note */}
              <div className="text-center text-sm text-base-content/50">
                <p>
                  Note: You will still receive essential transactional emails
                  (password resets, security alerts, etc.)
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
