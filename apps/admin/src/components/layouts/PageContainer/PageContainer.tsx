import { type ReactNode, type HTMLAttributes } from 'react';

/**
 * PageContainer - Centered container with configurable max-width.
 *
 * Pure layout component - provides centering and max-width constraints only.
 * No default padding - consumers control their own spacing.
 *
 * @example
 * ```tsx
 * <PageContainer maxWidth="4xl">
 *   <div className="p-6">
 *     Content with custom padding
 *   </div>
 * </PageContainer>
 * ```
 *
 * @example With full width
 * ```tsx
 * <PageContainer maxWidth="full">
 *   <DataTable ... />
 * </PageContainer>
 * ```
 */

export type MaxWidth =
  | 'sm'
  | 'md'
  | 'lg'
  | 'xl'
  | '2xl'
  | '3xl'
  | '4xl'
  | '5xl'
  | '6xl'
  | '7xl'
  | 'full';

const maxWidthClasses: Record<MaxWidth, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
  full: 'max-w-full',
};

export interface PageContainerProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Maximum width constraint (default: '7xl') */
  maxWidth?: MaxWidth;
  /** Test ID for automated testing */
  testId?: string;
}

export function PageContainer({
  children,
  maxWidth = '7xl',
  testId,
  className = '',
  ...props
}: PageContainerProps) {
  const maxWidthClass = maxWidthClasses[maxWidth];

  return (
    <div
      className={`container mx-auto ${maxWidthClass} ${className}`}
      data-testid={testId}
      {...props}
    >
      {children}
    </div>
  );
}

export default PageContainer;
