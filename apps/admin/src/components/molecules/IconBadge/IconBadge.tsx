import React from 'react';
// Lightweight local classNames helper to avoid adding an external dependency
function cx(...parts: Array<string | undefined | false | null>) {
    return parts.filter(Boolean).join(' ');
}
import { Icon } from '@/components/atoms/Icon';

export type IconBadgeColor = 'primary' | 'secondary' | 'accent' | 'info' | 'success' | 'warning' | 'error';

interface IconBadgeBaseProps {
    icon: string;
    "aria-label"?: string;
    className?: string;
    size?: 'sm' | 'md' | 'lg';
    rounded?: 'box' | 'full' | 'field';
}

interface IconBadgeSolidProps extends IconBadgeBaseProps {
    variant?: 'solid';
    color: IconBadgeColor;
    subtle?: never;
}

interface IconBadgeSubtleProps extends IconBadgeBaseProps {
    variant?: 'subtle';
    color: IconBadgeColor;
    /** Optional text color override semantic (rare). Defaults to the same color token. */
    textColorClassName?: string;
}

export type IconBadgeProps = IconBadgeSolidProps | IconBadgeSubtleProps;

const radiusMap: Record<NonNullable<IconBadgeBaseProps['rounded']>, string> = {
    box: 'rounded-box',
    full: 'rounded-full',
    field: 'rounded-[var(--radius-field)]',
};

const sizeMap: Record<NonNullable<IconBadgeBaseProps['size']>, string> = {
    sm: 'size-6 text-[14px]',
    md: 'size-8 text-[16px]',
    lg: 'size-10 text-[18px]',
};

/** Maps semantic color to pair of classes for variant styles. */
function getColorClasses(color: IconBadgeColor, variant: IconBadgeProps['variant']): { container: string; icon: string } {
    if (variant === 'subtle') {
        // Subtle: faint surface + colored border + colored icon text
        return {
            container: `bg-${color}/10 border border-${color}/20`,
            icon: `text-${color}`,
        };
    }
    // Solid
    return {
        container: `bg-${color} text-${color}-content`,
        icon: 'opacity-90',
    };
}

export const IconBadge: React.FC<IconBadgeProps> = ({
    icon,
    color,
    variant = 'subtle',
    size = 'md',
    rounded = 'box',
    className,
    'aria-label': ariaLabel,
}) => {
    const { container, icon: iconClass } = getColorClasses(color, variant);
    return (
        <span
            aria-label={ariaLabel}
            className={cx(
                'inline-flex items-center justify-center shrink-0 select-none',
                container,
                sizeMap[size],
                radiusMap[rounded],
                'transition-colors',
                className,
            )}
        >
            <Icon icon={icon} className={cx('size-4', iconClass)} ariaLabel={ariaLabel} />
        </span>
    );
};

export default IconBadge;
