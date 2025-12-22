import { useEffect, type DependencyList } from 'react';

type AsyncEffectCallback = (signal: { cancelled: boolean }) => Promise<void>;

export function useAsyncEffect(
  effect: AsyncEffectCallback,
  deps?: DependencyList
): void {
  useEffect(() => {
    const signal = { cancelled: false };
    effect(signal);
    return () => {
      signal.cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export default useAsyncEffect;
