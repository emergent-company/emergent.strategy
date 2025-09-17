/**
 * Adapted from react-daisyui Button component.
 * Original source: https://github.com/daisyui/react-daisyui (see submodule in reference/react-daisyui)
 * Changes:
 *  - Simplified prop surface (removed rarely used props: dataTheme, animation, responsive, glass)
 *  - Inlined minimal style mapping; avoided clsx/tailwind-merge dependency (use simple array join)
 *  - Strongly typed without introducing react-daisyui's broader constants/types file
 *  - Kept generic tag support (limited union) but default export aims for standard <button>
 */
import React, { forwardRef, ElementType, ReactNode } from 'react'

type ButtonColor =
    | 'neutral'
    | 'primary'
    | 'secondary'
    | 'accent'
    | 'info'
    | 'success'
    | 'warning'
    | 'error'
    | 'ghost'

type ButtonVariant = 'solid' | 'outline' | 'dash' | 'soft' | 'link'
type ButtonShape = 'circle' | 'square'
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

// Limited tag mapping we actually need; fallback to button
type TagName = 'button' | 'a' | 'span' | 'div'

export interface BaseButtonProps {
    color?: ButtonColor
    variant?: ButtonVariant
    size?: ButtonSize
    shape?: ButtonShape
    wide?: boolean
    fullWidth?: boolean
    loading?: boolean
    active?: boolean
    disabled?: boolean
    startIcon?: ReactNode
    endIcon?: ReactNode
    className?: string
}

export type ButtonProps<T extends TagName = 'button'> = BaseButtonProps &
    Omit<React.ComponentPropsWithoutRef<T>, keyof BaseButtonProps> & {
        tag?: T
    }

const VOID_TAGS = new Set<TagName>(['img' as TagName]) // kept minimal; we don't expose img currently

function buildClassNames(props: BaseButtonProps): string {
    const {
        color,
        variant,
        size,
        shape,
        wide,
        fullWidth,
        loading,
        active,
        disabled,
        className,
        startIcon,
        endIcon,
    } = props
    const classes: string[] = ['btn']
    if ((startIcon && !loading) || endIcon) classes.push('gap-2')
    if (size) classes.push(`btn-${size}`)
    if (shape) classes.push(`btn-${shape}`)
    if (variant && variant !== 'solid') classes.push(`btn-${variant}`)
    if (color) classes.push(`btn-${color}`)
    if (wide) classes.push('btn-wide')
    if (fullWidth) classes.push('btn-block')
    if (active) classes.push('btn-active')
    if (disabled) classes.push('btn-disabled')
    if (className) classes.push(className)
    return classes.join(' ')
}

export const Button = forwardRef<HTMLElement, ButtonProps>(function Button(
    {
        tag = 'button',
        children,
        loading,
        startIcon,
        endIcon,
        disabled,
        ...rest
    }: ButtonProps,
    ref
) {
    const Tag = tag as ElementType
    const classNames = buildClassNames({ ...rest, loading, disabled, startIcon, endIcon })

    const content = (
        <>
            {loading && (
                <span
                    className="loading loading-spinner loading-sm"
                    aria-hidden="true"
                    data-testid="button-loading"
                />
            )}
            {startIcon && !loading && <span className="inline-flex items-center">{startIcon}</span>}
            {children}
            {endIcon && <span className="inline-flex items-center">{endIcon}</span>}
        </>
    )

    // TypeScript: differentiate intrinsic element prop sets
    const shared: Record<string, unknown> = {
        ref,
        className: classNames,
        disabled: disabled && tag === 'button' ? true : undefined,
    }

    if (VOID_TAGS.has(tag)) {
        return <Tag {...(rest as any)} {...shared} />
    }

    return (
        <Tag {...(rest as any)} {...shared}>
            {content}
        </Tag>
    )
})

export default Button