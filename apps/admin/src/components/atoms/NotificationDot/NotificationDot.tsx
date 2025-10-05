/**
 * NotificationDot Atom
 * Visual indicator for unread notifications
 */
import React from 'react';

export interface NotificationDotProps {
    /** Whether the notification is unread */
    unread?: boolean;
    /** Optional custom className */
    className?: string;
}

export const NotificationDot: React.FC<NotificationDotProps> = ({
    unread = false,
    className = ''
}) => {
    return (
        <div
            className={`h-2 w-2 rounded-full flex-shrink-0 ${unread ? 'bg-primary' : 'bg-transparent'
                } ${className}`}
            aria-hidden="true"
        />
    );
};

export default NotificationDot;
