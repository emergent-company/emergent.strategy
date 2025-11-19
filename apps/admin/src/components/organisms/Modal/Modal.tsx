import React, { useCallback, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface ModalAction {
  /** Action button label */
  label: string;
  /** Variant -> maps to daisyUI button color classes */
  variant?:
    | 'primary'
    | 'secondary'
    | 'accent'
    | 'info'
    | 'success'
    | 'warning'
    | 'error'
    | 'ghost'
    | 'outline';
  /** When true button is disabled */
  disabled?: boolean;
  /** Optional leading icon (lucide icon class) */
  icon?: string;
  /** Click handler */
  onClick?: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
  /** Makes this the default (enter) action; will receive autoFocus when modal opens */
  autoFocus?: boolean;
}

export interface ModalProps {
  /** Controls open state (controlled) */
  open: boolean;
  /** Called when user requests close (backdrop click, Esc, close button) */
  onOpenChange: (
    open: boolean,
    reason: 'backdrop' | 'close-button' | 'escape'
  ) => void;
  /** Modal title (rendered as h2) */
  title?: string;
  /** Optional description paragraph */
  description?: React.ReactNode;
  /** Body JSX */
  children?: React.ReactNode;
  /** Action buttons (rendered in a <div class="modal-action">) */
  actions?: ModalAction[];
  /** Width utility classes (e.g. 'max-w-xl') appended to modal-box */
  sizeClassName?: string;
  /** Additional classes for the modal-box */
  className?: string;
  /** Hide default close (X) icon button */
  hideCloseButton?: boolean;
  /** Provide custom root container for portal (defaults to document.body) */
  container?: HTMLElement | null;
  /** ARIA label if no visible title provided */
  'aria-label'?: string;
}

// NOTE: Using <dialog> tag for native semantics; we manage open state imperatively for controlled usage.
export const Modal: React.FC<ModalProps> = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  actions,
  sizeClassName,
  className,
  hideCloseButton,
  container,
  'aria-label': ariaLabel,
}) => {
  const internalId = useId();
  const titleId = title ? `${internalId}-title` : undefined;
  const descId = description ? `${internalId}-desc` : undefined;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const defaultActionRef = useRef<HTMLButtonElement | null>(null);

  // Sync open state with dialog element
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // Guard for JSDOM which does not implement showModal/close
    const canShow = typeof (dialog as any).showModal === 'function';
    const canClose = typeof (dialog as any).close === 'function';
    if (open && !dialog.open) {
      if (canShow) {
        try {
          (dialog as any).showModal();
        } catch {
          dialog.setAttribute('open', '');
        }
      } else {
        dialog.setAttribute('open', '');
      }
    } else if (!open && dialog.open) {
      if (canClose) {
        try {
          (dialog as any).close();
        } catch {
          dialog.removeAttribute('open');
        }
      } else {
        dialog.removeAttribute('open');
      }
    }
  }, [open]);

  // escape key handler (dialog 'cancel' event also fires on Esc)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleCancel = (e: Event) => {
      e.preventDefault(); // prevent auto close so we control state
      onOpenChange(false, 'escape');
    };
    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [onOpenChange]);

  // Focus default action when opened
  useEffect(() => {
    if (open && defaultActionRef.current) {
      // Delay to ensure dialog content is rendered
      requestAnimationFrame(() => defaultActionRef.current?.focus());
    }
  }, [open]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLFormElement>) => {
      // Any click on backdrop form triggers close
      e.preventDefault();
      onOpenChange(false, 'backdrop');
    },
    [onOpenChange]
  );

  const handleCloseButton = useCallback(
    () => onOpenChange(false, 'close-button'),
    [onOpenChange]
  );

  const root =
    container ?? (typeof document !== 'undefined' ? document.body : null);
  if (!root) return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      className="modal"
      aria-labelledby={titleId}
      aria-describedby={descId}
      aria-label={ariaLabel}
    >
      <div
        className={[
          'modal-box flex flex-col max-h-[90vh] p-0',
          sizeClassName,
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {/* Fixed Header */}
        {(title || !hideCloseButton) && (
          <div className="flex justify-between items-start gap-4 p-6 pb-4 shrink-0">
            {title && (
              <h2 id={titleId} className="font-semibold text-lg">
                {title}
              </h2>
            )}
            {!hideCloseButton && (
              <button
                type="button"
                className="btn btn-sm btn-circle btn-ghost shrink-0"
                aria-label="Close dialog"
                onClick={handleCloseButton}
              >
                <span className="size-4 iconify lucide--x" />
              </button>
            )}
          </div>
        )}
        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {description && (
            <p id={descId} className="mb-4 text-sm text-base-content/70">
              {description}
            </p>
          )}
          {children && <div className="space-y-4">{children}</div>}
        </div>
        {/* Fixed Footer */}
        {actions && actions.length > 0 && (
          <div className="border-t border-base-300 p-6 pt-4 shrink-0">
            <div className="flex justify-end gap-3">
              {actions.map((a, idx) => {
                const btnClasses = [
                  'btn',
                  a.variant && a.variant !== 'outline' && a.variant !== 'ghost'
                    ? `btn-${a.variant}`
                    : '',
                  a.variant === 'outline' ? 'btn-outline' : '',
                  a.variant === 'ghost' ? 'btn-ghost' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <button
                    key={a.label + idx}
                    type="button"
                    className={btnClasses}
                    disabled={a.disabled}
                    onClick={a.onClick}
                    ref={a.autoFocus ? defaultActionRef : undefined}
                  >
                    {a.icon && (
                      <span
                        className={`iconify ${a.icon} size-4`}
                        aria-hidden="true"
                      />
                    )}
                    {a.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <form
        method="dialog"
        className="modal-backdrop"
        onClick={handleBackdropClick}
        aria-label="Close modal backdrop"
      >
        <button aria-hidden="true">close</button>
      </form>
    </dialog>,
    root
  );
};

Modal.displayName = 'Modal';

export default Modal;
