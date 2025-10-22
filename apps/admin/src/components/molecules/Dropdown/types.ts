/**
 * Dropdown Component Types
 * Based on daisyUI dropdown classes and react-daisyui implementation
 */

import type { ReactNode } from 'react';

export type DropdownPosition = 'top' | 'bottom' | 'left' | 'right';
export type DropdownAlignment = 'start' | 'center' | 'end';

export interface DropdownProps extends React.HTMLAttributes<HTMLDivElement> {
    /** Dropdown content */
    children: ReactNode;
    /** Additional CSS classes */
    className?: string;
    /** Vertical position (top/bottom) */
    vertical?: 'top' | 'bottom';
    /** Horizontal position (left/right) */
    horizontal?: 'left' | 'right';
    /** Align to end (right side) */
    end?: boolean;
    /** Open on hover instead of click */
    hover?: boolean;
    /** Force dropdown open state */
    open?: boolean;
    /** Data theme */
    dataTheme?: string;
}

export interface DropdownTriggerProps {
    /** Trigger content */
    children: ReactNode;
    /** Additional CSS classes */
    className?: string;
    /** Render as button */
    asButton?: boolean;
    /** Button variant */
    variant?: 'ghost' | 'outline' | 'primary' | 'secondary' | 'accent' | 'neutral' | 'error';
    /** Button size */
    size?: 'xs' | 'sm' | 'md' | 'lg';
    /** Disabled state */
    disabled?: boolean;
    /** Click handler (for button mode) */
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
}

export interface DropdownMenuProps extends React.HTMLAttributes<HTMLUListElement> {
    /** Menu items */
    children: ReactNode;
    /** Additional CSS classes */
    className?: string;
    /** Custom width */
    width?: string;
    /** Data theme */
    dataTheme?: string;
}

export interface DropdownItemProps extends React.LiHTMLAttributes<HTMLLIElement> {
    /** Item content */
    children: ReactNode;
    /** Additional CSS classes */
    className?: string;
    /** Click handler */
    onClick?: (e?: React.MouseEvent) => void;
    /** Render as link */
    asLink?: boolean;
    /** Link href */
    href?: string;
    /** Disabled state */
    disabled?: boolean;
}
