import {
  createContext,
  useContext,
  type ReactNode,
  type HTMLAttributes,
  type CSSProperties,
  Children,
  isValidElement,
} from 'react';

/**
 * TwoPanelLayout - Two panels side-by-side with one fixed width.
 *
 * Pure layout component - no visual styling (borders, backgrounds, padding).
 * Use compound components to define structure.
 *
 * @example
 * ```tsx
 * <TwoPanelLayout fixedPanel="left" fixedWidth={320}>
 *   <TwoPanelLayout.Left>
 *     <Panel>Sidebar content</Panel>
 *   </TwoPanelLayout.Left>
 *   <TwoPanelLayout.Right>
 *     <Panel>Main content</Panel>
 *   </TwoPanelLayout.Right>
 * </TwoPanelLayout>
 * ```
 *
 * @example With header
 * ```tsx
 * <TwoPanelLayout fixedPanel="right" fixedWidth="30%">
 *   <TwoPanelLayout.Header>
 *     Shared header across both panels
 *   </TwoPanelLayout.Header>
 *   <TwoPanelLayout.Left>Main content</TwoPanelLayout.Left>
 *   <TwoPanelLayout.Right>Side panel</TwoPanelLayout.Right>
 * </TwoPanelLayout>
 * ```
 *
 * @example Responsive stacking on mobile
 * ```tsx
 * <TwoPanelLayout fixedPanel="left" fixedWidth={320} stackOnMobile>
 *   <TwoPanelLayout.Left>Sidebar (stacks on top on mobile)</TwoPanelLayout.Left>
 *   <TwoPanelLayout.Right>Main content</TwoPanelLayout.Right>
 * </TwoPanelLayout>
 * ```
 */

// Context for configuration
interface TwoPanelContextValue {
  fixedPanel: 'left' | 'right';
  fixedWidth: number | string;
  stackOnMobile: boolean;
}

const TwoPanelContext = createContext<TwoPanelContextValue | null>(null);

function useTwoPanelContext(componentName: string) {
  const context = useContext(TwoPanelContext);
  if (!context) {
    throw new Error(
      `<TwoPanelLayout.${componentName}> must be used within a <TwoPanelLayout>`
    );
  }
  return context;
}

// Helper to convert width to CSS value
function toCssWidth(width: number | string): string {
  if (typeof width === 'number') {
    return `${width}px`;
  }
  return width;
}

// ---------- Compound Components ----------

export interface TwoPanelHeaderProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

function TwoPanelHeader({
  children,
  className = '',
  ...props
}: TwoPanelHeaderProps) {
  useTwoPanelContext('Header');
  return (
    <div className={`shrink-0 ${className}`} {...props}>
      {children}
    </div>
  );
}
TwoPanelHeader.displayName = 'TwoPanelLayout.Header';

export interface TwoPanelLeftProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

function TwoPanelLeft({
  children,
  className = '',
  style,
  ...props
}: TwoPanelLeftProps) {
  const { fixedPanel, fixedWidth, stackOnMobile } = useTwoPanelContext('Left');

  const isFixed = fixedPanel === 'left';
  const panelStyle: CSSProperties = isFixed
    ? { width: toCssWidth(fixedWidth), flexShrink: 0, ...style }
    : { ...style };

  // When stacking on mobile, override inline width style on small screens
  // Use responsive classes to handle mobile stacking
  const mobileClasses = stackOnMobile
    ? isFixed
      ? 'max-lg:!w-full max-lg:shrink-0'
      : 'max-lg:!w-full'
    : '';

  return (
    <div
      className={`flex flex-col min-h-0 ${
        isFixed ? '' : 'flex-1 min-w-0'
      } ${mobileClasses} ${className}`}
      style={panelStyle}
      {...props}
    >
      {children}
    </div>
  );
}
TwoPanelLeft.displayName = 'TwoPanelLayout.Left';

export interface TwoPanelRightProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

function TwoPanelRight({
  children,
  className = '',
  style,
  ...props
}: TwoPanelRightProps) {
  const { fixedPanel, fixedWidth, stackOnMobile } = useTwoPanelContext('Right');

  const isFixed = fixedPanel === 'right';
  const panelStyle: CSSProperties = isFixed
    ? { width: toCssWidth(fixedWidth), flexShrink: 0, ...style }
    : { ...style };

  // When stacking on mobile, override inline width style on small screens
  const mobileClasses = stackOnMobile
    ? isFixed
      ? 'max-lg:!w-full max-lg:shrink-0'
      : 'max-lg:!w-full'
    : '';

  return (
    <div
      className={`flex flex-col min-h-0 ${
        isFixed ? '' : 'flex-1 min-w-0'
      } ${mobileClasses} ${className}`}
      style={panelStyle}
      {...props}
    >
      {children}
    </div>
  );
}
TwoPanelRight.displayName = 'TwoPanelLayout.Right';

// ---------- Main Component ----------

export interface TwoPanelLayoutProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Which panel has fixed width (default: 'left') */
  fixedPanel?: 'left' | 'right';
  /** Width of the fixed panel in pixels or CSS value (default: 320) */
  fixedWidth?: number | string;
  /** Stack panels vertically on mobile/tablet (< lg breakpoint) (default: false) */
  stackOnMobile?: boolean;
}

function TwoPanelLayoutRoot({
  children,
  fixedPanel = 'left',
  fixedWidth = 320,
  stackOnMobile = false,
  className = '',
  ...props
}: TwoPanelLayoutProps) {
  // Separate header from left/right panels
  const childArray = Children.toArray(children);
  const header = childArray.find(
    (child) => isValidElement(child) && child.type === TwoPanelHeader
  );
  const panels = childArray.filter(
    (child) => !isValidElement(child) || child.type !== TwoPanelHeader
  );

  // Responsive classes for panel container
  const panelContainerClasses = stackOnMobile
    ? 'flex-1 flex min-h-0 overflow-hidden max-lg:flex-col lg:flex-row'
    : 'flex-1 flex min-h-0 overflow-hidden';

  return (
    <TwoPanelContext.Provider value={{ fixedPanel, fixedWidth, stackOnMobile }}>
      <div
        className={`flex flex-col h-full overflow-hidden ${className}`}
        {...props}
      >
        {header}
        <div className={panelContainerClasses}>{panels}</div>
      </div>
    </TwoPanelContext.Provider>
  );
}

// ---------- Export as compound component ----------

export const TwoPanelLayout = Object.assign(TwoPanelLayoutRoot, {
  Header: TwoPanelHeader,
  Left: TwoPanelLeft,
  Right: TwoPanelRight,
});

export default TwoPanelLayout;
