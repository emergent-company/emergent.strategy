import React from 'react';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';
export type AvatarShape = 'circle' | 'square';
export type AvatarRadiusToken =
  | 'none'
  | 'sm'
  | 'md'
  | 'lg'
  | 'xl'
  | 'full'
  | 'box'
  | 'field'
  | 'selector';
export type AvatarColor =
  | 'neutral'
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'info'
  | 'success'
  | 'warning'
  | 'error';

export interface AvatarProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'color'> {
  src?: string;
  /** Display initials when no image. Use `name` for automatic extraction. */
  letters?: string;
  /** Full name - used to auto-generate initials and deterministic color */
  name?: string;
  size?: AvatarSize | number;
  shape?: AvatarShape;
  /** Background color. If not provided and `name` is set, color is auto-generated. */
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

/** Text size classes proportional to avatar size */
const textSizeMap: Record<AvatarSize, string> = {
  xs: 'text-xs',
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-xl',
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

/** Available colors for auto-generation (excluding neutral for more vibrant avatars) */
const autoColors: AvatarColor[] = [
  'primary',
  'secondary',
  'accent',
  'info',
  'success',
  'warning',
  'error',
];

/**
 * Generate a deterministic color from a string (name, email, id).
 * Uses simple hash to ensure same input always produces same color.
 */
export function getColorFromString(str: string): AvatarColor {
  if (!str) return 'neutral';
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % autoColors.length;
  return autoColors[index];
}

/**
 * Extract initials from a name string.
 * - "John Doe" → "JD"
 * - "john.doe@email.com" → "JD"
 * - "Alice" → "AL"
 * - "" → "?"
 */
export function getInitials(name: string, maxLength = 2): string {
  if (!name) return '?';

  // Handle email addresses
  const cleanName = name.includes('@') ? name.split('@')[0] : name;

  // Split by common separators
  const parts = cleanName
    .replace(/[._-]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return '?';

  if (parts.length === 1) {
    // Single word: take first N characters
    return parts[0].slice(0, maxLength).toUpperCase();
  }

  // Multiple words: take first letter of each (up to maxLength)
  return parts
    .slice(0, maxLength)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

function join(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  (
    {
      src,
      letters,
      name,
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
    ref
  ) => {
    const isPlaceholder = !src;
    const dynDim =
      typeof size === 'number' ? { width: size, height: size } : undefined;
    const szClass =
      typeof size === 'number' ? '' : sizeClassMap[size as AvatarSize];
    const textClass =
      typeof size === 'number' ? 'text-sm' : textSizeMap[size as AvatarSize];

    const hasRing = Boolean(border || borderColor);
    const ringBase = hasRing ? 'ring ring-offset-base-100 ring-offset-2' : '';
    const ringColorCls =
      hasRing && borderColor ? ringColorMap[borderColor] : '';
    let shapeClass: string;
    if (shape === 'circle') {
      shapeClass = 'rounded-full';
    } else {
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
        shapeClass =
          radius && typeof radius !== 'number'
            ? radiusMap[radius]
            : 'rounded-none';
      }
    }

    const resolvedInitials = letters || (name ? getInitials(name) : undefined);
    const resolvedColor =
      color || (name ? getColorFromString(name) : 'neutral');
    const placeholderBg = colorBgMap[resolvedColor];

    const common = join(
      innerClassName,
      ringBase,
      ringColorCls,
      shapeClass,
      szClass,
      'flex items-center justify-center font-medium'
    );

    function renderContent(): React.ReactNode {
      const radiusStyle =
        typeof radius === 'number' && shape !== 'circle'
          ? { borderRadius: radius }
          : undefined;
      if (src) {
        return (
          <div className={common} style={{ ...dynDim, ...radiusStyle }}>
            <img
              src={src}
              alt=""
              className={join('object-cover', shapeClass, 'w-full h-full')}
            />
          </div>
        );
      }
      if (
        resolvedInitials ||
        (React.Children.count(children) === 1 && typeof children === 'string')
      ) {
        return (
          <div
            className={join(common, placeholderBg, textClass)}
            style={{ ...dynDim, ...radiusStyle }}
          >
            <span className="select-none">{resolvedInitials || children}</span>
          </div>
        );
      }
      if (React.Children.count(children) === 1) {
        const only = React.Children.only(children) as React.ReactElement<any>;
        const childClass = (only.props as any)?.className as string | undefined;
        const childStyle = (only.props as any)?.style as
          | React.CSSProperties
          | undefined;
        return (
          <div className={common} style={{ ...dynDim, ...radiusStyle }}>
            {React.cloneElement(only, {
              className: join(childClass),
              style: { ...childStyle },
            })}
          </div>
        );
      }
      return (
        <div
          className={join(common, placeholderBg, textClass)}
          style={{ ...dynDim, ...radiusStyle }}
        >
          <span className="select-none">?</span>
        </div>
      );
    }

    return (
      <div
        ref={ref}
        aria-label={ariaLabelProp || name || 'Avatar'}
        {...rest}
        className={join(
          'avatar',
          className,
          online && 'avatar-online',
          offline && 'avatar-offline',
          isPlaceholder && 'avatar-placeholder'
        )}
      >
        {renderContent()}
      </div>
    );
  }
);

Avatar.displayName = 'Avatar';

export default Avatar;
