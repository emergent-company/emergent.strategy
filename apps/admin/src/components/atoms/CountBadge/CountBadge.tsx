/**
 * CountBadge Atom
 * Displays a count in a badge (used in tabs)
 */
import React from 'react';

export interface CountBadgeProps {
    count: number;
    /** Badge style variant */
    variant?: 'primary' | 'neutral';
    /** Optional custom className */
    className?: string;
}

export const CountBadge: React.FC<CountBadgeProps> = ({
    count,
    variant = 'neutral',
    className = ''
}) => {
    const baseClasses = 'ml-1.5 rounded-full px-1.5 py-0.5 text-xs font-medium';
    const variantClasses = variant === 'primary'
        ? 'bg-primary text-primary-content'
        : 'bg-base-300 text-base-content';

    return (
        <span className={`${baseClasses} ${variantClasses} ${className}`}>
            {count}
        </span>
    );
};

export default CountBadge;
