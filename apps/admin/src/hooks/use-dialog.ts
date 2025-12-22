import { useEffect, useRef, useCallback, type RefObject } from 'react';

export interface UseDialogOptions {
  onClose?: () => void;
}

export interface UseDialogReturn {
  dialogRef: RefObject<HTMLDialogElement | null>;
  open: () => void;
  close: () => void;
}

export function useDialog(
  isOpen: boolean,
  options: UseDialogOptions = {}
): UseDialogReturn {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { onClose } = options;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !onClose) return;

    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  const open = useCallback(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  const close = useCallback(() => {
    const dialog = dialogRef.current;
    if (dialog && dialog.open) {
      dialog.close();
    }
  }, []);

  return { dialogRef, open, close };
}

export default useDialog;
