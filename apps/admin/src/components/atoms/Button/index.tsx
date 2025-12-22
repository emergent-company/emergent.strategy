/**
 * Button Atom
 *
 * Migrated from legacy path: src/components/ui/Button.tsx
 * Deprecation window for legacy shim ends 2025-11.
 */
import React, { forwardRef, ElementType, ReactNode } from 'react';
import { Spinner } from '@/components/atoms/Spinner';

export type ButtonColor =
  | 'neutral'
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'info'
  | 'success'
  | 'warning'
  | 'error'
  | 'ghost';

export type ButtonVariant = 'solid' | 'outline' | 'dash' | 'soft' | 'link';
export type ButtonShape = 'circle' | 'square';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

// Limited tag mapping we actually need; fallback to button
export type ButtonTagName = 'button' | 'a' | 'span' | 'div';

export interface BaseButtonProps {
  color?: ButtonColor;
  variant?: ButtonVariant;
  size?: ButtonSize;
  shape?: ButtonShape;
  wide?: boolean;
  fullWidth?: boolean;
  loading?: boolean;
  active?: boolean;
  disabled?: boolean;
  startIcon?: ReactNode;
  endIcon?: ReactNode;
  className?: string;
}

export type ButtonProps<T extends ButtonTagName = 'button'> = BaseButtonProps &
  Omit<React.ComponentPropsWithoutRef<T>, keyof BaseButtonProps> & {
    tag?: T;
  };

const VOID_TAGS = new Set<ButtonTagName>(['img' as ButtonTagName]);

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
  } = props;
  const classes: string[] = ['btn'];
  if ((startIcon && !loading) || endIcon) classes.push('gap-2');
  if (size) classes.push(`btn-${size}`);
  if (shape) classes.push(`btn-${shape}`);
  if (variant && variant !== 'solid') classes.push(`btn-${variant}`);
  if (color) classes.push(`btn-${color}`);
  if (wide) classes.push('btn-wide');
  if (fullWidth) classes.push('btn-block');
  if (active) classes.push('btn-active');
  if (disabled) classes.push('btn-disabled');
  if (className) classes.push(className);
  return classes.join(' ');
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
  const Tag = tag as ElementType;
  const classNames = buildClassNames({
    ...rest,
    loading,
    disabled,
    startIcon,
    endIcon,
  });

  const content = (
    <>
      {loading && <Spinner size="sm" data-testid="button-loading" />}
      {startIcon && !loading && (
        <span className="inline-flex items-center">{startIcon}</span>
      )}
      {children}
      {endIcon && <span className="inline-flex items-center">{endIcon}</span>}
    </>
  );

  const shared: Record<string, unknown> = {
    ref,
    className: classNames,
    disabled: disabled && tag === 'button' ? true : undefined,
  };

  if (VOID_TAGS.has(tag)) {
    return <Tag {...(rest as any)} {...shared} />;
  }

  return (
    <Tag {...(rest as any)} {...shared}>
      {content}
    </Tag>
  );
});

export default Button;
