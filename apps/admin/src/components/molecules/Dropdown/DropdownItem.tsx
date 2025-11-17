/**
 * DropdownItem Component
 * Renders an individual item within the dropdown menu
 */

import React from 'react';
import type { DropdownItemProps } from './types';

export const DropdownItem = React.forwardRef<HTMLLIElement, DropdownItemProps>(
  (
    {
      children,
      className = '',
      onClick,
      asLink = false,
      href,
      disabled = false,
      ...props
    },
    ref
  ) => {
    const handleClick = (e: React.MouseEvent) => {
      if (disabled) {
        e.preventDefault();
        return;
      }

      // Close dropdown by removing focus from the trigger label
      const dropdownContainer = (e.currentTarget as HTMLElement).closest(
        '.dropdown'
      );
      const label = dropdownContainer?.querySelector(
        'label[tabindex="0"]'
      ) as HTMLElement;
      if (label) {
        label.blur();
      }

      onClick?.(e);
    };

    const itemClasses = `${
      disabled ? 'disabled opacity-50 cursor-not-allowed' : ''
    } ${className}`.trim();

    return (
      <li ref={ref} className={itemClasses} {...props}>
        {asLink && href ? (
          <a href={href} onClick={handleClick}>
            {children}
          </a>
        ) : (
          <button type="button" onClick={handleClick} disabled={disabled}>
            {children}
          </button>
        )}
      </li>
    );
  }
);

DropdownItem.displayName = 'DropdownItem';
