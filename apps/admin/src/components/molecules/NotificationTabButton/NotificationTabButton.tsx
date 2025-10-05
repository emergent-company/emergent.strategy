/**
 * NotificationTabButton Molecule
 * Tab button with optional count badge for inbox navigation
 */
import React from 'react';
import { CountBadge } from '@/components/atoms/CountBadge';
import type { NotificationTab } from '@/types/notification';

export interface NotificationTabButtonProps {
    label: string;
    tab: NotificationTab;
    active?: boolean;
    count?: number;
    showBadge?: boolean;
    onClick?: () => void;
}

export const NotificationTabButton: React.FC<NotificationTabButtonProps> = ({
    label,
    tab,
    active = false,
    count,
    showBadge = false,
    onClick,
}) => {
    return (
        <button
            className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${active ? 'bg-base-200' : 'hover:bg-base-200'
                }`}
            onClick={onClick}
            role="tab"
            aria-selected={active}
            aria-controls={`${tab}-panel`}
        >
            {label}
            {showBadge && count !== undefined && count > 0 && (
                <CountBadge
                    count={count}
                    variant={tab === 'important' ? 'primary' : 'neutral'}
                />
            )}
        </button>
    );
};

export default NotificationTabButton;
