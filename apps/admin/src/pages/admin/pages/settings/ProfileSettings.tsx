import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import { PageContainer } from '@/components/layouts';
import { FormField } from '@/components/molecules/FormField';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/useAuth';

interface UserProfileDto {
  id: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  phoneE164?: string;
}

interface DeleteAccountResponse {
  deletedOrgs: string[];
  deletedProjects: string[];
  removedMemberships: number;
}

interface EmailPreferencesDto {
  releaseEmailsEnabled: boolean;
  marketingEmailsEnabled: boolean;
  unsubscribeToken: string;
}

export default function ProfileSettings() {
  const { fetchJson, apiBase } = useApi();
  const { showToast } = useToast();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<UserProfileDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const [emailPreferences, setEmailPreferences] =
    useState<EmailPreferencesDto | null>(null);
  const [emailPrefsLoading, setEmailPrefsLoading] = useState(true);
  const [emailPrefsSaving, setEmailPrefsSaving] = useState(false);

  useEffect(() => {
    loadProfile();
    loadEmailPreferences();
  }, []);

  const loadProfile = async () => {
    try {
      const data = await fetchJson<UserProfileDto>(
        `${apiBase}/api/user/profile`
      );
      setProfile(data);
    } catch (err) {
      console.error(err);
      showToast({ message: 'Failed to load profile', variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const loadEmailPreferences = async () => {
    try {
      const data = await fetchJson<EmailPreferencesDto>(
        `${apiBase}/api/user/email-preferences`
      );
      setEmailPreferences(data);
    } catch (err) {
      console.error(err);
    } finally {
      setEmailPrefsLoading(false);
    }
  };

  const handleEmailPreferenceChange = async (
    field: 'releaseEmailsEnabled' | 'marketingEmailsEnabled',
    value: boolean
  ) => {
    if (!emailPreferences) return;

    const updatedPrefs = { ...emailPreferences, [field]: value };
    setEmailPreferences(updatedPrefs);
    setEmailPrefsSaving(true);

    try {
      await fetchJson(`${apiBase}/api/user/email-preferences`, {
        method: 'PUT',
        body: {
          releaseEmailsEnabled: updatedPrefs.releaseEmailsEnabled,
          marketingEmailsEnabled: updatedPrefs.marketingEmailsEnabled,
        },
      });
      showToast({
        message: 'Email preferences updated',
        variant: 'success',
      });
    } catch (err) {
      console.error(err);
      setEmailPreferences(emailPreferences);
      showToast({
        message: 'Failed to update email preferences',
        variant: 'error',
      });
    } finally {
      setEmailPrefsSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setSaving(true);
    try {
      const updated = await fetchJson<UserProfileDto>(
        `${apiBase}/api/user/profile`,
        {
          method: 'PUT',
          body: {
            firstName: profile.firstName,
            lastName: profile.lastName,
            displayName: profile.displayName,
            phoneE164: profile.phoneE164,
          },
        }
      );
      setProfile(updated);
      showToast({
        message: 'Profile updated successfully',
        variant: 'success',
      });
    } catch (err) {
      console.error(err);
      showToast({ message: 'Failed to update profile', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return;

    setDeleting(true);
    try {
      const result = await fetchJson<DeleteAccountResponse>(
        `${apiBase}/api/user/profile`,
        { method: 'DELETE' }
      );

      showToast({
        message: 'Account deleted successfully',
        variant: 'success',
      });

      // Log the user out and redirect to home
      await logout();
      navigate('/');
    } catch (err) {
      console.error(err);
      showToast({
        message: 'Failed to delete account. Please try again.',
        variant: 'error',
      });
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
      setDeleteConfirmText('');
    }
  };

  if (loading) {
    return (
      <PageContainer maxWidth="4xl">
        <div className="flex items-center justify-center min-h-[400px]">
          <Spinner size="lg" />
        </div>
      </PageContainer>
    );
  }

  if (!profile) {
    return (
      <PageContainer maxWidth="4xl">
        <div className="alert alert-error">
          <Icon icon="lucide--alert-circle" className="size-5" />
          <span>Error loading profile</span>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="4xl" testId="page-settings-profile">
      <div className="text-sm breadcrumbs">
        <ul>
          <li>
            <Link to="/admin">Admin</Link>
          </li>
          <li>Settings</li>
          <li>Profile</li>
        </ul>
      </div>

      <h1 className="mt-4 font-semibold text-xl">Profile Settings</h1>
      <p className="mt-2 text-base-content/70">
        Manage your personal information and contact details
      </p>

      <div className="bg-base-100 mt-6 card-border card">
        <div className="gap-6 sm:gap-8 card-body">
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* First Name */}
              <FormField
                label="First Name"
                type="text"
                value={profile.firstName || ''}
                onChange={(e) =>
                  setProfile({ ...profile, firstName: e.target.value })
                }
                placeholder="Enter your first name"
              />

              {/* Last Name */}
              <FormField
                label="Last Name"
                type="text"
                value={profile.lastName || ''}
                onChange={(e) =>
                  setProfile({ ...profile, lastName: e.target.value })
                }
                placeholder="Enter your last name"
              />

              {/* Display Name */}
              <div className="md:col-span-2">
                <FormField
                  label="Display Name"
                  type="text"
                  value={profile.displayName || ''}
                  onChange={(e) =>
                    setProfile({ ...profile, displayName: e.target.value })
                  }
                  placeholder="Enter your display name"
                  description="How your name appears to others in the application"
                />
              </div>

              {/* Email (read-only) */}
              <FormField
                label="Email Address"
                type="email"
                value={user?.email || ''}
                readOnly
                disabled
                description="Managed by your identity provider"
              />

              {/* Phone Number */}
              <FormField
                label="Phone Number"
                type="tel"
                value={profile.phoneE164 || ''}
                onChange={(e) =>
                  setProfile({ ...profile, phoneE164: e.target.value })
                }
                placeholder="+1 (555) 000-0000"
                description="International format (e.g., +1234567890)"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end items-center gap-3 sm:gap-4 mt-6 pt-6 border-t border-base-200">
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={loadProfile}
                disabled={saving}
              >
                Reset
              </button>
              <button
                type="submit"
                className="btn btn-sm btn-primary"
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Spinner size="xs" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="font-semibold text-lg">Email Preferences</h2>
        <div className="bg-base-100 mt-4 card-border card">
          <div className="card-body">
            {emailPrefsLoading ? (
              <div className="flex items-center justify-center py-4">
                <Spinner size="md" />
              </div>
            ) : emailPreferences ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Release Notifications</h3>
                    <p className="text-sm text-base-content/70 mt-1">
                      Receive emails about new features and product updates
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary"
                    checked={emailPreferences.releaseEmailsEnabled}
                    onChange={(e) =>
                      handleEmailPreferenceChange(
                        'releaseEmailsEnabled',
                        e.target.checked
                      )
                    }
                    disabled={emailPrefsSaving}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Marketing Emails</h3>
                    <p className="text-sm text-base-content/70 mt-1">
                      Receive promotional content and special offers
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary"
                    checked={emailPreferences.marketingEmailsEnabled}
                    onChange={(e) =>
                      handleEmailPreferenceChange(
                        'marketingEmailsEnabled',
                        e.target.checked
                      )
                    }
                    disabled={emailPrefsSaving}
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm text-base-content/70">
                Unable to load email preferences
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="mt-8">
        <h2 className="font-semibold text-lg text-error">Danger Zone</h2>
        <div className="bg-base-100 mt-4 card border border-error/30">
          <div className="card-body">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="font-medium">Delete Account</h3>
                <p className="text-sm text-base-content/70 mt-1">
                  Permanently delete your account and all associated data. This
                  action cannot be undone.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-error btn-outline btn-sm"
                onClick={() => setShowDeleteModal(true)}
              >
                <Icon icon="lucide--trash-2" className="size-4" />
                Delete Account
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Account Confirmation Modal */}
      {showDeleteModal && (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg text-error flex items-center gap-2">
              <Icon icon="lucide--alert-triangle" className="size-5" />
              Delete Account
            </h3>
            <div className="py-4">
              <p className="text-base-content/80">
                This action is <strong>permanent and irreversible</strong>. All
                your data will be deleted, including:
              </p>
              <ul className="list-disc list-inside mt-3 text-sm text-base-content/70 space-y-1">
                <li>Your profile and personal information</li>
                <li>
                  Organizations where you are the sole owner (and their
                  projects)
                </li>
                <li>Your memberships in other organizations and projects</li>
              </ul>
              <div className="mt-4">
                <label className="label">
                  <span className="label-text">
                    Type <strong>DELETE</strong> to confirm
                  </span>
                </label>
                <input
                  type="text"
                  className="input input-bordered w-full"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="DELETE"
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="modal-action">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmText('');
                }}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-error"
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== 'DELETE' || deleting}
              >
                {deleting ? (
                  <>
                    <Spinner size="xs" />
                    Deleting...
                  </>
                ) : (
                  'Delete My Account'
                )}
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button
              onClick={() => {
                setShowDeleteModal(false);
                setDeleteConfirmText('');
              }}
            >
              close
            </button>
          </form>
        </dialog>
      )}
    </PageContainer>
  );
}
