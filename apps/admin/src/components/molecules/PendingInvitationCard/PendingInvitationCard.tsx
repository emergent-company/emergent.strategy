/**
 * PendingInvitationCard Molecule
 * Displays a pending project/org invitation with accept/decline actions
 */
import React from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Button } from '@/components/atoms/Button';
import { Spinner } from '@/components/atoms/Spinner';
import type { PendingInvite } from '@/hooks/use-pending-invites';

export interface PendingInvitationCardProps {
  invite: PendingInvite;
  onAccept: (token: string) => void;
  onDecline: (inviteId: string) => void;
  isAccepting?: boolean;
  isDeclining?: boolean;
}

/**
 * Format role for display
 */
const formatRole = (role: string): string => {
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

/**
 * Format relative time
 */
const formatRelativeTime = (timestamp: string): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const PendingInvitationCard: React.FC<PendingInvitationCardProps> = ({
  invite,
  onAccept,
  onDecline,
  isAccepting = false,
  isDeclining = false,
}) => {
  const isLoading = isAccepting || isDeclining;

  const handleAccept = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAccept(invite.token);
  };

  const handleDecline = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDecline(invite.id);
  };

  // Determine if this is a project invite or org invite
  const isProjectInvite = !!invite.projectId;
  const title = isProjectInvite
    ? invite.projectName || 'Unknown Project'
    : invite.organizationName || 'Unknown Organization';
  const subtitle = isProjectInvite
    ? invite.organizationName
      ? `in ${invite.organizationName}`
      : ''
    : '';

  return (
    <div className="flex items-start gap-4 bg-base-100 hover:bg-base-200/50 p-4 border border-base-300 rounded-lg transition-colors">
      {/* Icon */}
      <div className="flex justify-center items-center bg-primary/10 rounded-lg w-10 h-10 text-primary">
        <Icon
          icon={isProjectInvite ? 'lucide--folder' : 'lucide--building-2'}
          className="w-5 h-5"
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h4 className="font-semibold text-base-content">{title}</h4>
            {subtitle && (
              <p className="text-sm text-base-content/60">{subtitle}</p>
            )}
            <div className="flex items-center gap-2 mt-1">
              <span className="badge badge-sm badge-ghost">
                {formatRole(invite.role)}
              </span>
              <span className="text-xs text-base-content/50">
                {formatRelativeTime(invite.createdAt)}
              </span>
            </div>
          </div>

          {/* Timestamp on larger screens */}
          <span className="hidden sm:block flex-shrink-0 text-xs text-base-content/50 whitespace-nowrap">
            Received {formatRelativeTime(invite.createdAt)}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 mt-3">
          <Button
            size="sm"
            color="primary"
            onClick={handleAccept}
            disabled={isLoading}
            className="min-w-[80px]"
          >
            {isAccepting ? <Spinner size="xs" /> : 'Accept'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleDecline}
            disabled={isLoading}
            className="min-w-[80px]"
          >
            {isDeclining ? <Spinner size="xs" /> : 'Decline'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PendingInvitationCard;
