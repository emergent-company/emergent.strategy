import React from 'react'
import { Modal, ModalAction } from '../Modal/Modal'

export interface ConfirmActionModalProps {
    /** Controlled open state */
    open: boolean
    /** Called when user cancels or closes */
    onCancel: () => void
    /** Called when user confirms */
    onConfirm: () => void
    /** Title for the modal header */
    title?: string
    /** Optional descriptive text (can be ReactNode for formatting) */
    description?: React.ReactNode
    /** Additional body content under the description (e.g. details, list) */
    children?: React.ReactNode
    /** Visual emphasis variant for the confirm button */
    confirmVariant?: Exclude<ModalAction['variant'], undefined | 'ghost'>
    /** Custom confirm button label (default: Confirm) */
    confirmLabel?: string
    /** Custom cancel button label (default: Cancel) */
    cancelLabel?: string
    /** Disable confirm button (e.g. while processing) */
    confirmDisabled?: boolean
    /** Show a small spinner in the confirm button */
    confirmLoading?: boolean
    /** Max width utility (defaults to max-w-lg) */
    sizeClassName?: string
    /** Hide the close (X) button in header */
    hideCloseButton?: boolean
}

/**
 * Opinionated wrapper around the base <Modal /> for destructive or high‑impact confirmations.
 * Keeps a consistent button order and styling across the app.
 */
export const ConfirmActionModal: React.FC<ConfirmActionModalProps> = ({
    open,
    onCancel,
    onConfirm,
    title = 'Confirm Action',
    description,
    children,
    confirmVariant = 'primary',
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    confirmDisabled,
    confirmLoading,
    sizeClassName = 'max-w-lg',
    hideCloseButton
}) => {
    return (
        <Modal
            open={open}
            onOpenChange={(o, reason) => {
                if (!o) {
                    // Treat any external close triggers as cancel semantics
                    onCancel()
                }
            }}
            title={title}
            description={description}
            sizeClassName={sizeClassName}
            hideCloseButton={hideCloseButton}
            actions={[
                { label: cancelLabel, variant: 'ghost', onClick: onCancel },
                {
                    label: confirmLoading ? 'Working…' : confirmLabel,
                    variant: confirmVariant,
                    disabled: confirmDisabled || confirmLoading,
                    onClick: onConfirm,
                    autoFocus: true
                }
            ]}
        >
            {children}
        </Modal>
    )
}

ConfirmActionModal.displayName = 'ConfirmActionModal'

export default ConfirmActionModal
