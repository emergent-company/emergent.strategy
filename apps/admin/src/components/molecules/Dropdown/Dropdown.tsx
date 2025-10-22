/**
 * Dropdown Component (Molecule)
 * 
 * A flexible dropdown component using daisyUI classes with compound component pattern.
 * Based on react-daisyui implementation but simplified for our use case.
 * 
 * Features:
 * - Compound component API (Dropdown.Trigger, Dropdown.Menu, Dropdown.Item)
 * - Positioning control (top/bottom/left/right)
 * - Click outside handling via daisyUI
 * - Proper accessibility (ARIA roles, keyboard support)
 * - TypeScript strict typing
 * 
 * @example
 * ```tsx
 * <Dropdown end vertical="top">
 *   <Dropdown.Trigger asButton variant="outline" size="xs">
 *     Actions <Icon icon="lucide--chevron-down" />
 *   </Dropdown.Trigger>
 *   <Dropdown.Menu>
 *     <Dropdown.Item onClick={() => console.log('edit')}>
 *       <Icon icon="lucide--edit" /> Edit
 *     </Dropdown.Item>
 *     <Dropdown.Item onClick={() => console.log('delete')}>
 *       <Icon icon="lucide--trash" /> Delete
 *     </Dropdown.Item>
 *   </Dropdown.Menu>
 * </Dropdown>
 * ```
 */

import React, { useEffect, useRef } from 'react';
import type { DropdownProps } from './types';
import { DropdownTrigger } from './DropdownTrigger';
import { DropdownMenu } from './DropdownMenu';
import { DropdownItem } from './DropdownItem';

const DropdownRoot = React.forwardRef<HTMLDivElement, DropdownProps>(
    (
        {
            children,
            className = '',
            vertical,
            horizontal,
            end = false,
            hover = false,
            open = false,
            dataTheme,
            ...props
        },
        ref
    ) => {
        const dropdownRef = useRef<HTMLDivElement | null>(null);

        // Build className based on props
        const buildClassName = () => {
            const classes = ['dropdown'];

            if (vertical === 'top') classes.push('dropdown-top');
            if (vertical === 'bottom') classes.push('dropdown-bottom');
            if (horizontal === 'left') classes.push('dropdown-left');
            if (horizontal === 'right') classes.push('dropdown-right');
            if (end) classes.push('dropdown-end');
            if (hover) classes.push('dropdown-hover');
            if (open) classes.push('dropdown-open');
            if (className) classes.push(className);

            return classes.join(' ');
        };

        // Handle click outside to close dropdown (daisyUI handles this via details/label pattern)
        useEffect(() => {
            const handleClickOutside = (event: MouseEvent) => {
                if (
                    dropdownRef.current &&
                    !dropdownRef.current.contains(event.target as Node)
                ) {
                    // Remove focus to close dropdown
                    const activeElement = document.activeElement as HTMLElement;
                    if (
                        activeElement &&
                        dropdownRef.current.contains(activeElement)
                    ) {
                        activeElement.blur();
                    }
                }
            };

            document.addEventListener('mousedown', handleClickOutside);
            return () => {
                document.removeEventListener('mousedown', handleClickOutside);
            };
        }, []);

        return (
            <div
                ref={(node) => {
                    dropdownRef.current = node;
                    if (typeof ref === 'function') {
                        ref(node);
                    } else if (ref) {
                        ref.current = node;
                    }
                }}
                role="listbox"
                data-theme={dataTheme}
                className={buildClassName()}
                {...props}
            >
                {children}
            </div>
        );
    }
);

DropdownRoot.displayName = 'Dropdown';

// Compound component with sub-components
export const Dropdown = Object.assign(DropdownRoot, {
    Trigger: DropdownTrigger,
    Menu: DropdownMenu,
    Item: DropdownItem,
});

export default Dropdown;
