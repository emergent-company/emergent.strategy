/**
 * DropdownTrigger Component
 * Renders the trigger element (button or custom content) that opens the dropdown
 */

import React from 'react';

// Only include props we explicitly support
export interface TriggerPropsWithContext {
    anchorName?: string;
    popoverId?: string;
    children: React.ReactNode;
    className?: string;
    asButton?: boolean;
    variant?: 'ghost' | 'outline' | 'primary' | 'secondary' | 'accent' | 'neutral' | 'error';
    size?: 'xs' | 'sm' | 'md' | 'lg';
    disabled?: boolean;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
}

export const DropdownTrigger = React.forwardRef<HTMLButtonElement, TriggerPropsWithContext>(
    (props, ref) => {
        const {
            children,
            className = '',
            asButton = false,
            variant = 'ghost',
            size = 'sm',
            disabled = false,
            anchorName,
            popoverId,
            onClick,
        } = props;

        if (!asButton) {
            return (
                <label
                    tabIndex={0}
                    className={className}
                >
                    {children}
                </label>
            );
        }

        // Build button className
        const buttonClasses = ['btn'];
        if (variant) buttonClasses.push(`btn-${variant}`);
        if (size) buttonClasses.push(`btn-${size}`);
        if (className) buttonClasses.push(className);

        return (
            <button
                ref={ref}
                type="button"
                className={buttonClasses.join(' ')}
                disabled={disabled}
                onClick={onClick}
            >
                {children}
            </button>
        );
    }
);

DropdownTrigger.displayName = 'DropdownTrigger';
