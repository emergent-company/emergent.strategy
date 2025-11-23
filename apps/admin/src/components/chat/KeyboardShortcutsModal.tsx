import { useEffect, useRef } from 'react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Shortcut {
  keys: string[];
  description: string;
}

interface ShortcutCategory {
  category: string;
  shortcuts: Shortcut[];
}

/**
 * KeyboardShortcutsModal - Modal displaying available keyboard shortcuts
 *
 * Features:
 * - Organized by category
 * - Keyboard-dismissible (Escape)
 * - Focus trap when open
 * - Accessible (ARIA labels)
 * - Clean DaisyUI modal styling
 */
export function KeyboardShortcutsModal({
  isOpen,
  onClose,
}: KeyboardShortcutsModalProps) {
  const modalRef = useRef<HTMLDialogElement>(null);

  // Open/close modal based on isOpen prop
  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;

    if (isOpen) {
      modal.showModal();
    } else {
      modal.close();
    }
  }, [isOpen]);

  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const shortcuts: ShortcutCategory[] = [
    {
      category: 'Message Actions',
      shortcuts: [
        { keys: ['Enter'], description: 'Send message' },
        { keys: ['Shift', 'Enter'], description: 'New line in message' },
        { keys: ['Escape'], description: 'Clear input / Cancel edit' },
      ],
    },
    {
      category: 'Message History',
      shortcuts: [
        { keys: ['↑'], description: 'Load previous message for editing' },
        { keys: ['↓'], description: 'Navigate forward in history' },
      ],
    },
    {
      category: 'Text Navigation',
      shortcuts: [
        { keys: ['Home'], description: 'Move cursor to start' },
        { keys: ['End'], description: 'Move cursor to end' },
        { keys: ['Cmd/Ctrl', 'A'], description: 'Select all text' },
        { keys: ['Cmd/Ctrl', 'Z'], description: 'Undo' },
      ],
    },
    {
      category: 'Application',
      shortcuts: [
        { keys: ['Cmd/Ctrl', '/'], description: 'Show this shortcuts menu' },
      ],
    },
  ];

  return (
    <dialog
      ref={modalRef}
      className="modal"
      onClose={onClose}
      aria-labelledby="keyboard-shortcuts-title"
    >
      <div className="modal-box max-w-2xl">
        <h3 id="keyboard-shortcuts-title" className="font-bold text-lg mb-4">
          Keyboard Shortcuts
        </h3>

        <div className="space-y-6">
          {shortcuts.map((category) => (
            <div key={category.category}>
              <h4 className="text-sm font-semibold text-base-content/60 uppercase tracking-wide mb-3">
                {category.category}
              </h4>
              <div className="space-y-2">
                {category.shortcuts.map((shortcut, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-base-200 transition-colors"
                  >
                    <span className="text-sm">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, keyIndex) => (
                        <span
                          key={keyIndex}
                          className="flex items-center gap-1"
                        >
                          <kbd className="kbd kbd-sm">{key}</kbd>
                          {keyIndex < shortcut.keys.length - 1 && (
                            <span className="text-base-content/40">+</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="modal-action">
          <button className="btn btn-primary" onClick={onClose}>
            Got it
          </button>
        </div>

        <div className="mt-4 text-xs text-base-content/50 text-center">
          Press <kbd className="kbd kbd-xs">Escape</kbd> to close
        </div>
      </div>

      {/* Modal backdrop */}
      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose}>close</button>
      </form>
    </dialog>
  );
}
