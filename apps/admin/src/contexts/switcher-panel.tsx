import {
  ReactNode,
  createContext,
  useContext,
  useState,
  useCallback,
} from 'react';

type PanelType =
  | 'color'
  | 'logo-gradient'
  | 'logo-font'
  | 'theme-config'
  | null;

interface SwitcherPanelContextValue {
  openPanel: PanelType;
  setOpenPanel: (panel: PanelType) => void;
  togglePanel: (panel: PanelType) => void;
}

const SwitcherPanelContext = createContext<
  SwitcherPanelContextValue | undefined
>(undefined);

export function SwitcherPanelProvider({ children }: { children: ReactNode }) {
  const [openPanel, setOpenPanel] = useState<PanelType>(null);

  const togglePanel = useCallback((panel: PanelType) => {
    setOpenPanel((current) => (current === panel ? null : panel));
  }, []);

  return (
    <SwitcherPanelContext.Provider
      value={{ openPanel, setOpenPanel, togglePanel }}
    >
      {children}
    </SwitcherPanelContext.Provider>
  );
}

export function useSwitcherPanel() {
  const context = useContext(SwitcherPanelContext);
  if (!context) {
    throw new Error(
      'useSwitcherPanel must be used within SwitcherPanelProvider'
    );
  }
  return context;
}
