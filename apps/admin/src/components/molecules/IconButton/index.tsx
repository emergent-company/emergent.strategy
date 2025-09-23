import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
    'aria-label': string;
    children: ReactNode;
    className?: string;
}

export const IconButton = ({ children, className, ...rest }: IconButtonProps) => {
    const base = 'btn btn-sm btn-circle btn-ghost';
    return (
        <button type="button" className={[base, className].filter(Boolean).join(' ')} {...rest}>
            {children}
        </button>
    );
};

export default IconButton;
