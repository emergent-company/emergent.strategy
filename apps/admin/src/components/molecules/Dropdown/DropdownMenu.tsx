/**
 * DropdownMenu Component
 * Renders the dropdown menu container with proper styling and positioning
 */

import React from 'react';
import type { DropdownMenuProps } from './types';

export const DropdownMenu = React.forwardRef<HTMLUListElement, DropdownMenuProps>(
    (
        {
            children,
            className = '',
            width = 'w-52',
            dataTheme,
            ...props
        },
        ref
    ) => {
        const classes = `dropdown-content menu bg-base-100 rounded-box ${width} p-2 shadow-lg border border-base-300 z-[100] ${className}`.trim();

        return (
            <ul
                ref={ref}
                tabIndex={0}
                role="menu"
                data-theme={dataTheme}
                className={classes}
                {...props}
            >
                {children}
            </ul>
        );
    }
);

DropdownMenu.displayName = 'DropdownMenu';
