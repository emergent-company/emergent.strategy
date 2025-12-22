import { type ComponentProps } from 'react';

export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg';
export type SpinnerVariant =
  | 'spinner'
  | 'dots'
  | 'ring'
  | 'ball'
  | 'bars'
  | 'infinity';

export interface SpinnerProps extends Omit<ComponentProps<'span'>, 'children'> {
  /** Size of the spinner */
  size?: SpinnerSize;
  /** Variant/style of loading animation */
  variant?: SpinnerVariant;
}

const sizeClasses: Record<SpinnerSize, string> = {
  xs: 'loading-xs',
  sm: 'loading-sm',
  md: 'loading-md',
  lg: 'loading-lg',
};

const variantClasses: Record<SpinnerVariant, string> = {
  spinner: 'loading-spinner',
  dots: 'loading-dots',
  ring: 'loading-ring',
  ball: 'loading-ball',
  bars: 'loading-bars',
  infinity: 'loading-infinity',
};

/**
 * Spinner component for loading states.
 *
 * Replaces raw `<span className="loading loading-spinner loading-{size}">` patterns.
 *
 * @example
 * // Basic usage
 * <Spinner />
 *
 * @example
 * // With size
 * <Spinner size="lg" />
 *
 * @example
 * // With custom color
 * <Spinner size="md" className="text-primary" />
 *
 * @example
 * // Different variant
 * <Spinner variant="dots" size="sm" />
 */
export const Spinner = ({
  size = 'md',
  variant = 'spinner',
  className,
  ...props
}: SpinnerProps) => {
  const classes = [
    'loading',
    variantClasses[variant],
    sizeClasses[size],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <span className={classes} aria-hidden="true" {...props} />;
};

export default Spinner;
