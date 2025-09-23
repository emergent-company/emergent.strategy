import React from 'react';
import { Avatar, AvatarProps } from '@/components/atoms/Avatar';

export interface AvatarGroupProps extends React.HTMLAttributes<HTMLDivElement> {
    /** Avatar children. Should be Avatar atoms; non-Avatar elements are ignored */
    children: React.ReactElement<AvatarProps>[] | React.ReactElement<AvatarProps>;
    /** Negative horizontal spacing utility. Use preset sizes: none|sm|md|lg or provide custom class (e.g. -space-x-3) */
    overlap?: 'none' | 'sm' | 'md' | 'lg' | string; // maps to -space-x-? utilities
    /** @deprecated use overlap instead */
    overlapClassName?: string;
    /** Limit number shown; extra avatars collapsed into "+N" placeholder */
    max?: number;
    /** Shared size override applied to all children if provided */
    size?: AvatarProps['size'];
    /** Apply ring border to all avatars (delegated to Avatar border+borderColor) */
    withBorder?: boolean;
    borderColor?: AvatarProps['borderColor'];
}

function isAvatarElement(node: React.ReactNode): node is React.ReactElement<AvatarProps> {
    return Boolean(React.isValidElement(node) && (node.type as any)?.displayName === 'Avatar');
}

function cx(...parts: Array<string | undefined | false>): string {
    return parts.filter(Boolean).join(' ');
}

function overlapToClass(val: AvatarGroupProps['overlap'], fallback?: string): string | undefined {
    if (!val) return fallback;
    if (val === 'none') return undefined;
    if (val === 'sm') return '-space-x-3';
    if (val === 'md') return '-space-x-4';
    if (val === 'lg') return '-space-x-6';
    return val; // custom class passed directly
}

export const AvatarGroup = React.forwardRef<HTMLDivElement, AvatarGroupProps>(
    (
        {
            children,
            className,
            overlap = 'lg',
            overlapClassName, // legacy support
            max,
            size,
            withBorder,
            borderColor,
            ...rest
        },
        ref,
    ) => {
        const childArray = React.Children.toArray(children).filter(isAvatarElement) as React.ReactElement<AvatarProps>[];
        const total = childArray.length;

        let visible = childArray;
        let overflowCount = 0;
        if (typeof max === 'number' && max >= 0 && total > max) {
            // Show (max - 1) real avatars + 1 overflow summary so total rendered == max
            overflowCount = total - max; // number of hidden avatars
            visible = childArray.slice(0, max - 1);
        }

        // Determine default overflow shape based on the first visible child's shape prop (if any)
        const firstShape = (childArray[0]?.props as AvatarProps | undefined)?.shape;

        const processed = visible.map((child, idx) => {
            const overrideProps: Partial<AvatarProps> = {};
            if (size) overrideProps.size = size;
            // If a borderColor is provided we implicitly enable border ring for usability
            if (withBorder || borderColor) overrideProps.border = true;
            if (borderColor) overrideProps.borderColor = borderColor;
            return React.cloneElement(child, { key: child.key ?? idx, ...overrideProps });
        });

        if (typeof max === 'number' && max >= 0 && total > max) {
            processed.push(
                <Avatar
                    key="overflow"
                    shape={firstShape}
                    size={size}
                    letters={`+${overflowCount}`}
                    color="neutral"
                    border={withBorder || !!borderColor}
                    borderColor={borderColor}
                />,
            );
        }

        const overlapClass = overlapToClass(overlap, overlapClassName || '-space-x-6');
        const classes = cx('avatar-group', overlapClass, className);

        return (
            <div
                ref={ref}
                className={classes}
                aria-label={`Group of ${total} avatar${total === 1 ? '' : 's'}`}
                data-count={total}
                {...rest}
            >
                {processed}
            </div>
        );
    },
);

AvatarGroup.displayName = 'AvatarGroup';

export default AvatarGroup;
