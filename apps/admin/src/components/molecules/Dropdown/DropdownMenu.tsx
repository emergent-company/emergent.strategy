/**
 * DropdownMenu Component
 * Renders the dropdown menu container with fixed positioning
 * to escape overflow containers in tables
 */

import React, { useEffect, useRef } from 'react';
import type { DropdownMenuProps } from './types';

export const DropdownMenu = React.forwardRef<HTMLUListElement, DropdownMenuProps & { anchorName?: string; popoverId?: string }>(
    (
        {
            children,
            className = '',
            width = 'w-52',
            dataTheme,
            anchorName,
            popoverId,
            ...props
        },
        ref
    ) => {
        const internalRef = useRef<HTMLUListElement>(null);
        const menuRef = (ref as React.RefObject<HTMLUListElement>) || internalRef;

        useEffect(() => {
            const menu = menuRef.current;
            if (!menu) return;

            const updatePosition = () => {
                const parent = menu.parentElement;
                if (!parent) return;

                const trigger = parent.querySelector('button, label');
                if (!trigger) return;

                const rect = trigger.getBoundingClientRect();

                // Position below the trigger, aligned to the right
                menu.style.top = `${rect.bottom + 4}px`;
                menu.style.right = `${window.innerWidth - rect.right}px`;
                menu.style.left = 'auto';
            };

            // Position on mount and when dropdown opens
            updatePosition();

            // Reposition on scroll or resize
            window.addEventListener('scroll', updatePosition, true);
            window.addEventListener('resize', updatePosition);

            return () => {
                window.removeEventListener('scroll', updatePosition, true);
                window.removeEventListener('resize', updatePosition);
            };
        }, [menuRef]);

        // Use fixed positioning to escape overflow containers
        const classes = `dropdown-content menu bg-base-100 rounded-box ${width} p-2 shadow-lg border border-base-300 z-[9999] ${className}`.trim();

        return (
            <ul
                ref={menuRef}
                role="menu"
                data-theme={dataTheme}
                className={classes}
                style={{ position: 'fixed' }}
                {...props}
            >
                {children}
            </ul>
        );
    }
);

DropdownMenu.displayName = 'DropdownMenu';
