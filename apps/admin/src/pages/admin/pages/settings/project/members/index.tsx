// Page: Project Settings - Members
// Route: /admin/settings/project/members

import { useState, useEffect, useCallback, useMemo } from 'react';
import { PageContainer } from '@/components/layouts';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import { Avatar } from '@/components/atoms/Avatar';
import { useApi } from '@/hooks/use-api';
import { useConfig } from '@/contexts/config';
import { useAuth } from '@/contexts/useAuth';
import { ConfirmActionModal } from '@/components/organisms/ConfirmActionModal/ConfirmActionModal';
import { Modal } from '@/components/organisms/Modal/Modal';

// ============ Types ============

interface ProjectMember {
  id: string;
  email: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  role: 'project_admin' | 'project_user';
  joinedAt: string;
}

interface SentInvite {
  id: string;
  email: string;
  role: string;
  status: 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired';
  createdAt: string;
  expiresAt?: string;
}

// ============ Helper Components ============

function MemberRow({
  member,
  currentUserEmail,
  onRemove,
  isRemoving,
}: {
  member: ProjectMember;
  currentUserEmail?: string;
  onRemove: (member: ProjectMember) => void;
  isRemoving: boolean;
}) {
  // Build display name from available fields
  const displayName =
    member.displayName ||
    [member.firstName, member.lastName].filter(Boolean).join(' ') ||
    null;

  // Compare by email to detect current user
  const isCurrentUser =
    currentUserEmail &&
    member.email.toLowerCase() === currentUserEmail.toLowerCase();

  return (
    <tr className="hover:bg-base-200/50">
      <td>
        <div className="flex items-center gap-3">
          <Avatar
            src={member.avatarUrl}
            name={displayName || member.email}
            size="sm"
          />
          <div>
            <div className="font-medium">
              {member.email}
              {isCurrentUser && (
                <span className="ml-2 badge badge-sm badge-ghost">You</span>
              )}
            </div>
          </div>
        </div>
      </td>
      <td className="text-base-content/70">
        {displayName || <span className="text-base-content/40">-</span>}
      </td>
      <td>
        <span
          className={`badge badge-sm ${
            member.role === 'project_admin' ? 'badge-primary' : 'badge-ghost'
          }`}
        >
          {member.role === 'project_admin' ? 'Admin' : 'Member'}
        </span>
      </td>
      <td className="text-base-content/60">
        {new Date(member.joinedAt).toLocaleDateString()}
      </td>
      <td>
        <button
          className="btn btn-sm btn-ghost btn-error"
          onClick={() => onRemove(member)}
          disabled={isRemoving}
          title={isCurrentUser ? 'Leave project' : 'Remove member'}
        >
          {isRemoving ? (
            <Spinner size="xs" />
          ) : (
            <Icon icon="lucide--user-minus" className="size-4" />
          )}
        </button>
      </td>
    </tr>
  );
}

function InviteRow({
  invite,
  onCancel,
  isCancelling,
}: {
  invite: SentInvite;
  onCancel: (invite: SentInvite) => void;
  isCancelling: boolean;
}) {
  const statusBadge = {
    pending: 'badge-warning',
    accepted: 'badge-success',
    declined: 'badge-error',
    revoked: 'badge-ghost',
    expired: 'badge-ghost',
  }[invite.status];

  const isPending = invite.status === 'pending';

  return (
    <tr className="hover:bg-base-200/50">
      <td>
        <div className="flex items-center gap-3">
          <Avatar name={invite.email} size="sm" />
          <div>
            <div className="font-medium">{invite.email}</div>
          </div>
        </div>
      </td>
      <td>
        <span
          className={`badge badge-sm ${
            invite.role === 'project_admin' ? 'badge-primary' : 'badge-ghost'
          }`}
        >
          {invite.role === 'project_admin' ? 'Admin' : 'Member'}
        </span>
      </td>
      <td>
        <span className={`badge badge-sm ${statusBadge}`}>
          {invite.status.charAt(0).toUpperCase() + invite.status.slice(1)}
        </span>
      </td>
      <td className="text-base-content/60">
        {new Date(invite.createdAt).toLocaleDateString()}
      </td>
      <td>
        {isPending && (
          <button
            className="btn btn-sm btn-ghost btn-error"
            onClick={() => onCancel(invite)}
            disabled={isCancelling}
            title="Cancel invitation"
          >
            {isCancelling ? (
              <Spinner size="xs" />
            ) : (
              <Icon icon="lucide--x" className="size-4" />
            )}
          </button>
        )}
      </td>
    </tr>
  );
}

// ============ Invite Modal ============

function InviteMemberModal({
  open,
  onClose,
  projectId,
  orgId,
  onInviteSent,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  orgId: string;
  onInviteSent: () => void;
}) {
  const { apiBase, fetchJson } = useApi();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'project_admin' | 'project_user'>(
    'project_user'
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Simple email validation
  const isValidEmail = (emailStr: string) =>
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailStr);

  const handleSubmit = async () => {
    if (!isValidEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Use the unified invite endpoint - backend handles both new and existing users
      await fetchJson(`${apiBase}/api/invites`, {
        method: 'POST',
        body: {
          orgId,
          projectId,
          email: email.trim(),
          role,
        },
      });

      onInviteSent();
      onClose();
      resetForm();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to send invitation'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setEmail('');
    setRole('project_user');
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const canSubmit = isValidEmail(email);

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && handleClose()}
      title="Invite Member"
      description="Enter an email address to invite someone to this project. They'll receive an email with instructions to join."
      sizeClassName="max-w-md"
      actions={[
        { label: 'Cancel', variant: 'ghost', onClick: handleClose },
        {
          label: isSubmitting ? 'Sending...' : 'Send Invitation',
          variant: 'primary',
          disabled: !canSubmit || isSubmitting,
          onClick: handleSubmit,
          autoFocus: true,
        },
      ]}
    >
      {error && (
        <div className="alert alert-error mb-4">
          <Icon icon="lucide--alert-circle" className="size-4" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-4">
        {/* Email Input */}
        <div className="form-control">
          <label className="label">
            <span className="label-text">Email Address</span>
          </label>
          <input
            type="email"
            className="input input-bordered w-full"
            placeholder="colleague@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
        </div>

        {/* Role Selection */}
        <div className="form-control">
          <label className="label">
            <span className="label-text">Role</span>
          </label>
          <select
            className="select select-bordered w-full"
            value={role}
            onChange={(e) =>
              setRole(e.target.value as 'project_admin' | 'project_user')
            }
          >
            <option value="project_user">Member</option>
            <option value="project_admin">Admin</option>
          </select>
          <label className="label">
            <span className="label-text-alt text-base-content/60">
              {role === 'project_admin'
                ? 'Admins can manage members and project settings'
                : 'Members can view and contribute to the project'}
            </span>
          </label>
        </div>
      </div>
    </Modal>
  );
}

// ============ Main Page Component ============

export default function ProjectMembersPage() {
  const { config } = useConfig();
  const { apiBase, fetchJson } = useApi();
  const { user } = useAuth();

  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [invites, setInvites] = useState<SentInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Remove member state
  const [memberToRemove, setMemberToRemove] = useState<ProjectMember | null>(
    null
  );
  const [isRemoving, setIsRemoving] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  // Cancel invite state
  const [inviteToCancel, setInviteToCancel] = useState<SentInvite | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancellingInviteId, setCancellingInviteId] = useState<string | null>(
    null
  );

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);

  const projectId = config.activeProjectId;
  const orgId = config.activeOrgId;

  // Load members and invites
  const loadData = useCallback(async () => {
    if (!projectId) return;

    setLoading(true);
    setError(null);

    try {
      const [membersData, invitesData] = await Promise.all([
        fetchJson<ProjectMember[]>(
          `${apiBase}/api/projects/${projectId}/members`
        ),
        fetchJson<SentInvite[]>(`${apiBase}/api/projects/${projectId}/invites`),
      ]);

      setMembers(membersData || []);
      setInvites(invitesData || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load members');
    } finally {
      setLoading(false);
    }
  }, [projectId, apiBase, fetchJson]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Remove member handler
  const handleRemoveMember = async () => {
    if (!memberToRemove || !projectId) return;

    setIsRemoving(true);
    setRemovingMemberId(memberToRemove.id);

    try {
      await fetchJson(
        `${apiBase}/api/projects/${projectId}/members/${memberToRemove.id}`,
        { method: 'DELETE' }
      );
      await loadData();
      setMemberToRemove(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    } finally {
      setIsRemoving(false);
      setRemovingMemberId(null);
    }
  };

  // Cancel invite handler
  const handleCancelInvite = async () => {
    if (!inviteToCancel) return;

    setIsCancelling(true);
    setCancellingInviteId(inviteToCancel.id);

    try {
      await fetchJson(`${apiBase}/api/invites/${inviteToCancel.id}`, {
        method: 'DELETE',
      });
      await loadData();
      setInviteToCancel(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to cancel invitation'
      );
    } finally {
      setIsCancelling(false);
      setCancellingInviteId(null);
    }
  };

  // Filter to show only pending invites in the table
  const pendingInvites = useMemo(
    () => invites.filter((i) => i.status === 'pending'),
    [invites]
  );

  if (!projectId) {
    return (
      <PageContainer maxWidth="full" className="px-4">
        <div className="alert alert-warning">
          <Icon icon="lucide--alert-triangle" className="size-5" />
          <span>Please select a project to manage members</span>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      maxWidth="full"
      className="px-4"
      testId="page-settings-project-members"
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="font-bold text-2xl">Project Members</h1>
          <p className="mt-1 text-base-content/70">
            Manage who has access to this project
          </p>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setShowInviteModal(true)}
        >
          <Icon icon="lucide--user-plus" className="size-4" />
          Invite Member
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div role="alert" className="mb-4 alert alert-error">
          <Icon icon="lucide--alert-circle" className="size-5" />
          <span>{error}</span>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
          >
            <Icon icon="lucide--x" className="size-4" />
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="space-y-8">
          {/* Members Table */}
          <section>
            <h2 className="mb-4 font-semibold text-lg">
              Members ({members.length})
            </h2>
            {members.length === 0 ? (
              <div className="bg-base-200 card">
                <div className="py-12 text-center card-body">
                  <Icon
                    icon="lucide--users"
                    className="opacity-50 mx-auto mb-3 size-12"
                  />
                  <p className="text-base-content/70">No members yet</p>
                  <p className="text-sm text-base-content/60">
                    Invite users to collaborate on this project
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto bg-base-100 border border-base-300 rounded-lg">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Joined</th>
                      <th className="w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((member) => (
                      <MemberRow
                        key={member.id}
                        member={member}
                        currentUserEmail={user?.email}
                        onRemove={setMemberToRemove}
                        isRemoving={removingMemberId === member.id}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Pending Invitations */}
          {pendingInvites.length > 0 && (
            <section>
              <h2 className="mb-4 font-semibold text-lg">
                Pending Invitations ({pendingInvites.length})
              </h2>
              <div className="overflow-x-auto bg-base-100 border border-base-300 rounded-lg">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Sent</th>
                      <th className="w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingInvites.map((invite) => (
                      <InviteRow
                        key={invite.id}
                        invite={invite}
                        onCancel={setInviteToCancel}
                        isCancelling={cancellingInviteId === invite.id}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}

      {/* Invite Member Modal */}
      {orgId && (
        <InviteMemberModal
          open={showInviteModal}
          onClose={() => setShowInviteModal(false)}
          projectId={projectId}
          orgId={orgId}
          onInviteSent={loadData}
        />
      )}

      {/* Remove Member Confirmation */}
      <ConfirmActionModal
        open={!!memberToRemove}
        onCancel={() => setMemberToRemove(null)}
        onConfirm={handleRemoveMember}
        title={
          memberToRemove?.email.toLowerCase() === user?.email?.toLowerCase()
            ? 'Leave Project'
            : 'Remove Member'
        }
        description={
          memberToRemove?.email.toLowerCase() === user?.email?.toLowerCase()
            ? 'Are you sure you want to leave this project? You will lose access to all project resources.'
            : `Are you sure you want to remove ${
                memberToRemove?.displayName ||
                memberToRemove?.email ||
                'this member'
              } from the project?`
        }
        confirmVariant="error"
        confirmLabel={
          memberToRemove?.email.toLowerCase() === user?.email?.toLowerCase()
            ? 'Leave'
            : 'Remove'
        }
        confirmLoading={isRemoving}
      />

      {/* Cancel Invite Confirmation */}
      <ConfirmActionModal
        open={!!inviteToCancel}
        onCancel={() => setInviteToCancel(null)}
        onConfirm={handleCancelInvite}
        title="Cancel Invitation"
        description={`Are you sure you want to cancel the invitation to ${inviteToCancel?.email}?`}
        confirmVariant="error"
        confirmLabel="Cancel Invitation"
        confirmLoading={isCancelling}
      />
    </PageContainer>
  );
}
