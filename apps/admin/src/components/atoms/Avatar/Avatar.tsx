import React from 'react';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';
export type AvatarShape = 'circle' | 'square';
export type AvatarRadiusToken = 'none' | 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'box' | 'field' | 'selector';
export type AvatarColor = 'neutral' | 'primary' | 'secondary' | 'accent' | 'info' | 'success' | 'warning' | 'error';

export interface AvatarProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'color'> {
    src?: string;
    letters?: string;
    size?: AvatarSize | number;
    shape?: AvatarShape;
    color?: AvatarColor;
    border?: boolean;
    borderColor?: AvatarColor;
    online?: boolean;
    offline?: boolean;
    innerClassName?: string;
    /** Square shape corner radius design token or raw number (px) when shape === 'square' */
    radius?: AvatarRadiusToken | number;
    children?: React.ReactNode;
}

const sizeClassMap: Record<AvatarSize, string> = {
    xs: 'w-8 h-8',
    sm: 'w-10 h-10',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
};

const colorBgMap: Record<AvatarColor, string> = {
    neutral: 'bg-neutral text-neutral-content',
    primary: 'bg-primary text-primary-content',
    secondary: 'bg-secondary text-secondary-content',
    accent: 'bg-accent text-accent-content',
    info: 'bg-info text-info-content',
    success: 'bg-success text-success-content',
    warning: 'bg-warning text-warning-content',
    error: 'bg-error text-error-content',
};

const ringColorMap: Record<AvatarColor, string> = {
    neutral: 'ring-neutral',
    primary: 'ring-primary',
    secondary: 'ring-secondary',
    accent: 'ring-accent',
    info: 'ring-info',
    success: 'ring-success',
    warning: 'ring-warning',
    error: 'ring-error',
};

function join(...parts: Array<string | false | undefined>): string {
    return parts.filter(Boolean).join(' ');
}

export const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
    (
        {
            src,
            letters,
            size = 'sm',
            shape = 'circle',
            color,
            border,
            borderColor,
            online,
            offline,
            innerClassName,
            radius,
            className,
            children,
            'aria-label': ariaLabelProp,
            ...rest
        },
        ref,
    ) => {
        const isPlaceholder = !src;
        const dynDim = typeof size === 'number' ? { width: size, height: size } : undefined;
        const szClass = typeof size === 'number' ? '' : sizeClassMap[size as AvatarSize];

        // If a borderColor is provided without explicitly setting border, we still render the ring
        const hasRing = Boolean(border || borderColor);
        const ringBase = hasRing ? 'ring ring-offset-base-100 ring-offset-2' : '';
        const ringColorCls = hasRing && borderColor ? ringColorMap[borderColor] : '';
        let shapeClass: string;
        if (shape === 'circle') {
            shapeClass = 'rounded-full';
        } else {
            // square variant: default to sharp corners unless a radius token / number is supplied
            if (typeof radius === 'number') {
                shapeClass = 'rounded-none';
            } else {
                const radiusMap: Record<AvatarRadiusToken, string> = {
                    none: 'rounded-none',
                    sm: 'rounded-sm',
                    md: 'rounded-md',
                    lg: 'rounded-lg',
                    xl: 'rounded-xl',
                    full: 'rounded-full',
                    box: 'rounded-[var(--radius-box)]',
                    field: 'rounded-[var(--radius-field)]',
                    selector: 'rounded-[var(--radius-selector)]',
                };
                shapeClass = radius && typeof radius !== 'number' ? radiusMap[radius] : 'rounded-none';
            }
        }

        const placeholderBg = color ? colorBgMap[color] : 'bg-neutral-focus text-neutral-content';
        const common = join(innerClassName, ringBase, ringColorCls, shapeClass, szClass);

        function renderContent(): React.ReactNode {
            const radiusStyle = typeof radius === 'number' && shape !== 'circle' ? { borderRadius: radius } : undefined;
            if (src) {
                return (
                    <div className={common} style={{ ...dynDim, ...radiusStyle }}>
                        <img src={src} alt="" className={join('object-cover', shapeClass, 'w-full h-full')} />
                    </div>
                );
            }
            if (letters || (React.Children.count(children) === 1 && typeof children === 'string')) {
                return (
                    <div className={join(common, placeholderBg)} style={{ ...dynDim, ...radiusStyle }}>
                        <span>{letters || children}</span>
                    </div>
                );
            }
            if (React.Children.count(children) === 1) {
                const only = React.Children.only(children) as React.ReactElement<any>;
                const childClass = (only.props as any)?.className as string | undefined;
                const childStyle = (only.props as any)?.style as React.CSSProperties | undefined;
                return (
                    <div className={common} style={{ ...dynDim, ...radiusStyle }}>
                        {React.cloneElement(only, { className: join(childClass), style: { ...childStyle } })}
                    </div>
                );
            }
            return (
                <div className={common} style={{ ...dynDim, ...radiusStyle }}>
                    {children}
                </div>
            );
        }

        return (
            <div
                ref={ref}
                aria-label={ariaLabelProp || 'Avatar photo'}
                {...rest}
                className={join('avatar', className, online && 'avatar-online', offline && 'avatar-offline', isPlaceholder && 'avatar-placeholder')}
            >
                {renderContent()}
            </div>
        );
    },
);

Avatar.displayName = 'Avatar';

export default Avatar;