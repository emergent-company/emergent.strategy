import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';

/** Tab names for the object preview drawer */
export type ObjectPreviewTab =
  | 'properties'
  | 'relationships'
  | 'system'
  | 'history';

interface ObjectPreviewState {
  /** Whether the drawer is open */
  isOpen: boolean;
  /** ID of the currently previewed object (null if drawer is closed) */
  objectId: string | null;
  /** Currently active tab in the drawer */
  activeTab: ObjectPreviewTab;
}

interface ObjectPreviewContextValue {
  /** Current state of the object preview drawer */
  state: ObjectPreviewState;
  /** Open the preview drawer with the specified object. If already open, switches to the new object. */
  openPreview: (objectId: string) => void;
  /** Close the preview drawer */
  closePreview: () => void;
  /** Change the active tab */
  setActiveTab: (tab: ObjectPreviewTab) => void;
}

const ObjectPreviewContext = createContext<
  ObjectPreviewContextValue | undefined
>(undefined);

const initialState: ObjectPreviewState = {
  isOpen: false,
  objectId: null,
  activeTab: 'properties',
};

export function ObjectPreviewProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ObjectPreviewState>(initialState);

  const openPreview = useCallback((objectId: string) => {
    setState((prev) => ({
      ...prev,
      isOpen: true,
      objectId,
      // Keep the current tab when switching objects
    }));
  }, []);

  const closePreview = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isOpen: false,
      objectId: null,
      // Reset to properties tab when closing
      activeTab: 'properties',
    }));
  }, []);

  const setActiveTab = useCallback((tab: ObjectPreviewTab) => {
    setState((prev) => ({
      ...prev,
      activeTab: tab,
    }));
  }, []);

  return (
    <ObjectPreviewContext.Provider
      value={{ state, openPreview, closePreview, setActiveTab }}
    >
      {children}
    </ObjectPreviewContext.Provider>
  );
}

export function useObjectPreview() {
  const context = useContext(ObjectPreviewContext);
  if (!context) {
    throw new Error(
      'useObjectPreview must be used within ObjectPreviewProvider'
    );
  }
  return context;
}
