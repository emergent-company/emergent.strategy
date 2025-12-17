import {
  createContext,
  useContext,
  type ReactNode,
  type HTMLAttributes,
} from 'react';

/**
 * Panel - Layout container with optional header, scrollable content, and footer.
 *
 * Pure layout component - no visual styling (borders, backgrounds, padding).
 * Use compound components to define structure.
 *
 * @example
 * ```tsx
 * <Panel>
 *   <Panel.Header>Title</Panel.Header>
 *   <Panel.Content>Scrollable content here</Panel.Content>
 *   <Panel.Footer>Action buttons</Panel.Footer>
 * </Panel>
 * ```
 */

// Context to ensure compound components are used within Panel
const PanelContext = createContext<boolean>(false);

function usePanelContext(componentName: string) {
  const context = useContext(PanelContext);
  if (!context) {
    throw new Error(`<Panel.${componentName}> must be used within a <Panel>`);
  }
  return context;
}

// ---------- Compound Components ----------

export interface PanelHeaderProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

function PanelHeader({ children, className = '', ...props }: PanelHeaderProps) {
  usePanelContext('Header');
  return (
    <div className={`shrink-0 ${className}`} {...props}>
      {children}
    </div>
  );
}

export interface PanelContentProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

function PanelContent({
  children,
  className = '',
  ...props
}: PanelContentProps) {
  usePanelContext('Content');
  return (
    <div className={`flex-1 min-h-0 overflow-y-auto ${className}`} {...props}>
      {children}
    </div>
  );
}

export interface PanelFooterProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

function PanelFooter({ children, className = '', ...props }: PanelFooterProps) {
  usePanelContext('Footer');
  return (
    <div className={`shrink-0 ${className}`} {...props}>
      {children}
    </div>
  );
}

// ---------- Main Panel Component ----------

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

function PanelRoot({ children, className = '', ...props }: PanelProps) {
  return (
    <PanelContext.Provider value={true}>
      <div className={`flex flex-col h-full min-h-0 ${className}`} {...props}>
        {children}
      </div>
    </PanelContext.Provider>
  );
}

// ---------- Export as compound component ----------

export const Panel = Object.assign(PanelRoot, {
  Header: PanelHeader,
  Content: PanelContent,
  Footer: PanelFooter,
});

export default Panel;
