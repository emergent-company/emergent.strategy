import { useEffect, type RefObject, type DependencyList } from 'react';

export interface UseScrollToBottomOptions {
  behavior?: ScrollBehavior;
}

export function useScrollToBottom<T extends HTMLElement>(
  ref: RefObject<T | null>,
  deps: DependencyList = [],
  options: UseScrollToBottomOptions = {}
): void {
  const { behavior = 'smooth' } = options;

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export default useScrollToBottom;
