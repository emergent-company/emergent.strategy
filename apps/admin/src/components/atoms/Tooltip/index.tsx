import React, { type ReactNode } from 'react';

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
    content: ReactNode;
    placement?: TooltipPlacement;
    className?: string;
    children: ReactNode;
}

export const Tooltip: React.FC<TooltipProps> = ({ content, placement = 'top', className, children }) => {
    const placementClass =
        placement === 'top'
            ? 'tooltip-top'
            : placement === 'bottom'
                ? 'tooltip-bottom'
                : placement === 'left'
                    ? 'tooltip-left'
                    : 'tooltip-right';

    const cls = ['tooltip', placementClass, className].filter(Boolean).join(' ');

    return (
        <div className={cls}>
            <div className="bg-base-100 shadow p-3 font-normal text-base-content text-start tooltip-content">{content}</div>
            {children}
        </div>
    );
};

export default Tooltip;
