import { useEffect, type RefObject } from 'react';

export interface UseAutoResizeTextareaOptions {
  maxHeight?: number;
}

export function useAutoResizeTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  options: UseAutoResizeTextareaOptions = {}
): void {
  const { maxHeight = 200 } = options;

  useEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }, [ref, value, maxHeight]);
}

export default useAutoResizeTextarea;
