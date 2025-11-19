import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Icon } from '@/components/atoms/Icon';
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

export default function ProfileSettings() {
  const { fetchJson, apiBase } = useApi();
  const { showToast } = useToast();
  const { user } = useAuth();

  const [profile, setProfile] = useState<UserProfileDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProfile();
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

  if (loading) {
    return (
      <div className="min-sm:container">
        <div className="flex items-center justify-center min-h-[400px]">
          <span className="loading loading-spinner loading-lg"></span>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-sm:container">
        <div className="alert alert-error">
          <Icon icon="lucide--alert-circle" className="size-5" />
          <span>Error loading profile</span>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="page-settings-profile" className="min-sm:container">
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
                    <span className="loading loading-spinner loading-xs"></span>
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
    </div>
  );
}
