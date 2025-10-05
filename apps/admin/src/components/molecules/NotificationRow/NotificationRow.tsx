/**
 * NotificationRow Molecule
 * Single notification row matching ClickUp's design
 */
import React from 'react';
import { NotificationDot } from '@/components/atoms/NotificationDot';
import { Icon } from '@/components/atoms/Icon';
import type { Notification } from '@/types/notification';

export interface NotificationRowProps {
    notification: Notification;
    onClick?: (notification: Notification) => void;
}

export const NotificationRow: React.FC<NotificationRowProps> = ({
    notification,
    onClick,
}) => {
    const hasUnread = !notification.readAt;

    const handleClick = () => {
        onClick?.(notification);
    };

    // Format relative time (simplified)
    const formatRelativeTime = (timestamp: string): string => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m`;
        if (diffHours < 24) return `${diffHours}h`;
        if (diffDays < 7) return `${diffDays}d`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    return (
        <button
            className="group flex items-start gap-3 hover:bg-base-200/50 px-4 py-3 border-b border-base-300/50 w-full text-left transition-colors"
            onClick={handleClick}
        >
            {/* Left unread indicator */}
            <div className="mt-1.5">
                <NotificationDot unread={hasUnread} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className={`mb-1.5 text-base-content ${hasUnread ? 'font-semibold' : ''}`}>
                    {notification.title}
                </div>
                <div className="text-sm text-base-content/60 line-clamp-1">
                    {notification.message}
                </div>
            </div>

            {/* Right side - reactions + timestamp */}
            <div className="flex flex-shrink-0 items-center gap-3 text-xs text-base-content/50">
                {typeof notification.details?.reactions === 'number' && notification.details.reactions > 0 ? (
                    <div className="flex items-center gap-1">
                        <Icon icon="lucide--message-circle" className="w-4 h-4" />
                        <span>{notification.details.reactions}</span>
                    </div>
                ) : null}
                <span className="whitespace-nowrap">
                    {formatRelativeTime(notification.createdAt)}
                </span>
            </div>
        </button>
    );
};

export default NotificationRow;
