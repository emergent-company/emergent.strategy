import type { HTMLAttributes } from 'react';

export interface IconProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
    /** Iconify class for the icon. Use lucide icons like "lucide--home". */
    icon: string;
    /** Accessible label. If provided, role="img" is set. Otherwise the icon is aria-hidden. */
    ariaLabel?: string;
}

export const Icon = ({ icon, className, ariaLabel, ...rest }: IconProps) => {
    const classes = ['iconify', icon, className].filter(Boolean).join(' ');
    const a11y = ariaLabel ? ({ role: 'img', 'aria-label': ariaLabel } as const) : ({ 'aria-hidden': true } as const);
    return <span className={classes} {...a11y} {...rest} />;
};

export default Icon;
