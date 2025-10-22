/**
 * Dropdown Component (Molecule)
 * 
 * A flexible dropdown component using HTML Popover API and CSS Anchor Positioning.
 * This approach eliminates z-index and overflow issues in scrollable containers.
 * Based on daisyUI v5 recommendations for dropdowns in complex layouts.
 * 
 * Features:
 * - Compound component API (Dropdown.Trigger, Dropdown.Menu, Dropdown.Item)
 * - Positioning control (top/bottom/left/right)
 * - Works correctly in scrollable containers (tables, etc.)
 * - Proper accessibility (ARIA roles, keyboard support)
 * - TypeScript strict typing
 * 
 * @example
 * ```tsx
 * <Dropdown end>
 *   <Dropdown.Trigger asButton variant="outline" size="xs">
 *     Actions <Icon icon="lucide--chevron-down" />
 *   </Dropdown.Trigger>
 *   <Dropdown.Menu>
 *     <Dropdown.Item onClick={() => console.log('edit')}>
 *       <Icon icon="lucide--edit" /> Edit
 *     </Dropdown.Item>
 *   </Dropdown.Menu>
 * </Dropdown>
 * ```
 */

import React, { useId } from 'react';
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
        const uniqueId = useId();
        const anchorName = `--anchor-${uniqueId}`;
        const popoverId = `popover-${uniqueId}`;

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

        // Pass context to children
        const childrenWithProps = React.Children.map(children, child => {
            if (React.isValidElement(child)) {
                // Pass anchorName and popoverId to both Trigger and Menu
                return React.cloneElement(child as React.ReactElement<any>, {
                    anchorName,
                    popoverId,
                });
            }
            return child;
        });

        return (
            <div
                ref={ref}
                role="listbox"
                data-theme={dataTheme}
                className={buildClassName()}
                {...props}
            >
                {childrenWithProps}
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
