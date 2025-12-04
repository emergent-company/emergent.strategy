import { useCallback, useRef, useState } from 'react';

export interface UseRovingTabindexOptions {
  /** Total number of items in the list */
  itemCount: number;
  /** Whether navigation wraps around at boundaries */
  wrap?: boolean;
  /** Orientation of the list */
  orientation?: 'vertical' | 'horizontal';
  /** Callback when an item is selected (Enter/Space pressed) */
  onSelect?: (index: number) => void;
  /** Callback when Escape is pressed */
  onEscape?: () => void;
}

export interface UseRovingTabindexReturn {
  /** Currently focused item index (-1 if none) */
  focusedIndex: number;
  /** Set the focused index programmatically */
  setFocusedIndex: (index: number) => void;
  /** Get props for a list item at the given index */
  getItemProps: (index: number) => {
    tabIndex: number;
    ref: (el: HTMLElement | null) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    onFocus: () => void;
  };
  /** Reset focus to first item */
  resetFocus: () => void;
  /** Ref map for accessing item elements */
  itemRefs: React.RefObject<Map<number, HTMLElement>>;
}

/**
 * Hook for implementing roving tabindex keyboard navigation pattern.
 * Only one item in the list is tabbable at a time (tabIndex=0),
 * all others have tabIndex=-1. Arrow keys move focus between items.
 */
export function useRovingTabindex({
  itemCount,
  wrap = true,
  orientation = 'vertical',
  onSelect,
  onEscape,
}: UseRovingTabindexOptions): UseRovingTabindexReturn {
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const itemRefs = useRef<Map<number, HTMLElement>>(new Map());

  const focusItem = useCallback((index: number) => {
    const element = itemRefs.current.get(index);
    if (element) {
      element.focus();
      setFocusedIndex(index);
    }
  }, []);

  const moveFocus = useCallback(
    (direction: 'next' | 'prev' | 'first' | 'last') => {
      if (itemCount === 0) return;

      let newIndex: number;
      const currentIndex = focusedIndex === -1 ? 0 : focusedIndex;

      switch (direction) {
        case 'next':
          newIndex = currentIndex + 1;
          if (newIndex >= itemCount) {
            newIndex = wrap ? 0 : itemCount - 1;
          }
          break;
        case 'prev':
          newIndex = currentIndex - 1;
          if (newIndex < 0) {
            newIndex = wrap ? itemCount - 1 : 0;
          }
          break;
        case 'first':
          newIndex = 0;
          break;
        case 'last':
          newIndex = itemCount - 1;
          break;
      }

      focusItem(newIndex);
    },
    [focusedIndex, itemCount, wrap, focusItem]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      const prevKey = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';
      const nextKey = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';

      switch (e.key) {
        case nextKey:
          e.preventDefault();
          moveFocus('next');
          break;
        case prevKey:
          e.preventDefault();
          moveFocus('prev');
          break;
        case 'Home':
          e.preventDefault();
          moveFocus('first');
          break;
        case 'End':
          e.preventDefault();
          moveFocus('last');
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          onSelect?.(index);
          break;
        case 'Escape':
          e.preventDefault();
          onEscape?.();
          break;
      }
    },
    [orientation, moveFocus, onSelect, onEscape]
  );

  const getItemProps = useCallback(
    (index: number) => ({
      tabIndex:
        focusedIndex === index || (focusedIndex === -1 && index === 0) ? 0 : -1,
      ref: (el: HTMLElement | null) => {
        if (el) {
          itemRefs.current.set(index, el);
        } else {
          itemRefs.current.delete(index);
        }
      },
      onKeyDown: (e: React.KeyboardEvent) => handleKeyDown(e, index),
      onFocus: () => setFocusedIndex(index),
    }),
    [focusedIndex, handleKeyDown]
  );

  const resetFocus = useCallback(() => {
    setFocusedIndex(-1);
  }, []);

  return {
    focusedIndex,
    setFocusedIndex,
    getItemProps,
    resetFocus,
    itemRefs,
  };
}
