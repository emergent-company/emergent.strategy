import {
  createContext,
  useContext,
  type ReactNode,
  type HTMLAttributes,
  Children,
  isValidElement,
} from 'react';

/**
 * SplitPanelLayout - Two equal panels side-by-side with configurable ratio.
 *
 * Pure layout component - no visual styling (borders, backgrounds, padding).
 * Use compound components to define structure.
 *
 * @example Default 50/50 split
 * ```tsx
 * <SplitPanelLayout>
 *   <SplitPanelLayout.Left>
 *     <Panel>Left content</Panel>
 *   </SplitPanelLayout.Left>
 *   <SplitPanelLayout.Right>
 *     <Panel>Right content</Panel>
 *   </SplitPanelLayout.Right>
 * </SplitPanelLayout>
 * ```
 *
 * @example 40/60 split
 * ```tsx
 * <SplitPanelLayout ratio="40/60">
 *   <SplitPanelLayout.Left>Smaller left</SplitPanelLayout.Left>
 *   <SplitPanelLayout.Right>Larger right</SplitPanelLayout.Right>
 * </SplitPanelLayout>
 * ```
 */

// Supported ratios
export type SplitRatio =
  | '50/50'
  | '40/60'
  | '60/40'
  | '33/67'
  | '67/33'
  | '25/75'
  | '75/25';

// Map ratios to flex basis values
const ratioToFlex: Record<SplitRatio, { left: string; right: string }> = {
  '50/50': { left: '50%', right: '50%' },
  '40/60': { left: '40%', right: '60%' },
  '60/40': { left: '60%', right: '40%' },
  '33/67': { left: '33.333%', right: '66.667%' },
  '67/33': { left: '66.667%', right: '33.333%' },
  '25/75': { left: '25%', right: '75%' },
  '75/25': { left: '75%', right: '25%' },
};

// Context for configuration
interface SplitPanelContextValue {
  ratio: SplitRatio;
}

const SplitPanelContext = createContext<SplitPanelContextValue | null>(null);

function useSplitPanelContext(componentName: string) {
  const context = useContext(SplitPanelContext);
  if (!context) {
    throw new Error(
      `<SplitPanelLayout.${componentName}> must be used within a <SplitPanelLayout>`
    );
  }
  return context;
}

// ---------- Compound Components ----------

export interface SplitPanelHeaderProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

function SplitPanelHeader({
  children,
  className = '',
  ...props
}: SplitPanelHeaderProps) {
  useSplitPanelContext('Header');
  return (
    <div className={`shrink-0 ${className}`} {...props}>
      {children}
    </div>
  );
}
SplitPanelHeader.displayName = 'SplitPanelLayout.Header';

export interface SplitPanelLeftProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

function SplitPanelLeft({
  children,
  className = '',
  style,
  ...props
}: SplitPanelLeftProps) {
  const { ratio } = useSplitPanelContext('Left');
  const flexBasis = ratioToFlex[ratio].left;

  return (
    <div
      className={`flex flex-col min-h-0 min-w-0 ${className}`}
      style={{ flexBasis, flexGrow: 0, flexShrink: 0, ...style }}
      {...props}
    >
      {children}
    </div>
  );
}
SplitPanelLeft.displayName = 'SplitPanelLayout.Left';

export interface SplitPanelRightProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

function SplitPanelRight({
  children,
  className = '',
  style,
  ...props
}: SplitPanelRightProps) {
  const { ratio } = useSplitPanelContext('Right');
  const flexBasis = ratioToFlex[ratio].right;

  return (
    <div
      className={`flex flex-col min-h-0 min-w-0 ${className}`}
      style={{ flexBasis, flexGrow: 0, flexShrink: 0, ...style }}
      {...props}
    >
      {children}
    </div>
  );
}
SplitPanelRight.displayName = 'SplitPanelLayout.Right';

// ---------- Main Component ----------

export interface SplitPanelLayoutProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Split ratio between panels (default: '50/50') */
  ratio?: SplitRatio;
}

function SplitPanelLayoutRoot({
  children,
  ratio = '50/50',
  className = '',
  ...props
}: SplitPanelLayoutProps) {
  // Separate header from left/right panels
  const childArray = Children.toArray(children);
  const header = childArray.find(
    (child) => isValidElement(child) && child.type === SplitPanelHeader
  );
  const panels = childArray.filter(
    (child) => !isValidElement(child) || child.type !== SplitPanelHeader
  );

  return (
    <SplitPanelContext.Provider value={{ ratio }}>
      <div
        className={`flex flex-col h-full overflow-hidden ${className}`}
        {...props}
      >
        {header}
        <div className="flex-1 flex min-h-0 overflow-hidden">{panels}</div>
      </div>
    </SplitPanelContext.Provider>
  );
}

// ---------- Export as compound component ----------

export const SplitPanelLayout = Object.assign(SplitPanelLayoutRoot, {
  Header: SplitPanelHeader,
  Left: SplitPanelLeft,
  Right: SplitPanelRight,
});

export default SplitPanelLayout;
