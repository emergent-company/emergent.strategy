/**
 * DropdownTrigger Component
 * Renders the trigger element for the dropdown (button or custom content)
 */

import React from 'react';
import type { DropdownTriggerProps } from './types';

export const DropdownTrigger = React.forwardRef<HTMLLabelElement, DropdownTriggerProps>(
    (
        {
            children,
            className = '',
            asButton = true,
            variant = 'ghost',
            size = 'sm',
            disabled = false,
            ...props
        },
        ref
    ) => {
        const buttonClasses = asButton
            ? `btn btn-${size} ${variant === 'outline' ? 'btn-outline' : `btn-${variant}`} ${disabled ? 'btn-disabled' : ''}`
            : '';

        return (
            <label
                ref={ref}
                tabIndex={disabled ? -1 : 0}
                className={`${buttonClasses} ${className}`.trim()}
                {...props}
            >
                {children}
            </label>
        );
    }
);

DropdownTrigger.displayName = 'DropdownTrigger';
