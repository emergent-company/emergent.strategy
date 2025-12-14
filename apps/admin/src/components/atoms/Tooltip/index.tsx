import React, { type ReactNode, type CSSProperties } from 'react';

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';
export type TooltipAlign = 'start' | 'center' | 'end';
export type TooltipColor =
  | 'neutral'
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'info'
  | 'success'
  | 'warning'
  | 'error';

export interface TooltipProps {
  content: ReactNode;
  placement?: TooltipPlacement;
  align?: TooltipAlign;
  color?: TooltipColor;
  className?: string;
  children: ReactNode;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  placement = 'top',
  align = 'center',
  color,
  className,
  children,
}) => {
  const placementClass =
    placement === 'top'
      ? 'tooltip-top'
      : placement === 'bottom'
      ? 'tooltip-bottom'
      : placement === 'left'
      ? 'tooltip-left'
      : 'tooltip-right';

  const colorClass = color ? `tooltip-${color}` : '';

  const cls = ['tooltip', placementClass, colorClass, className]
    .filter(Boolean)
    .join(' ');

  // Calculate alignment styles for tooltip-content
  // DaisyUI tooltips use CSS transforms to center; we override for start/end alignment
  const getAlignmentStyles = (): CSSProperties => {
    const baseStyles: CSSProperties = {
      padding: '12px 16px',
    };

    if (align === 'center') {
      return baseStyles;
    }

    // For top/bottom placements, adjust horizontal alignment
    if (placement === 'top' || placement === 'bottom') {
      if (align === 'start') {
        return {
          ...baseStyles,
          left: '0',
          transform: 'translateX(0)',
        };
      }
      if (align === 'end') {
        return {
          ...baseStyles,
          left: 'auto',
          right: '0',
          transform: 'translateX(0)',
        };
      }
    }

    // For left/right placements, adjust vertical alignment
    if (placement === 'left' || placement === 'right') {
      if (align === 'start') {
        return {
          ...baseStyles,
          top: '0',
          transform: 'translateY(0)',
        };
      }
      if (align === 'end') {
        return {
          ...baseStyles,
          top: 'auto',
          bottom: '0',
          transform: 'translateY(0)',
        };
      }
    }

    return baseStyles;
  };

  return (
    <div className={cls}>
      <div
        className="tooltip-content !rounded-md !z-[9999] !bg-neutral !text-neutral-content !w-auto !max-w-none"
        style={getAlignmentStyles()}
      >
        {content}
      </div>
      {children}
    </div>
  );
};

export default Tooltip;
