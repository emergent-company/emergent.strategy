import React, { useRef } from 'react'
import { Icon } from '@/components/atoms/Icon'

export const TopbarSearchButton: React.FC = () => {
    const dialogRef = useRef<HTMLDialogElement>(null)
    const showModal = () => dialogRef.current?.showModal()
    return (
        <>
            <button
                className='hidden md:flex justify-start gap-2 border-base-300 btn-outline w-48 h-9 !text-sm text-base-content/70 btn btn-sm btn-ghost'
                onClick={showModal}
            >
                <Icon icon='lucide--search' className='size-4' />
                <span>Search</span>
            </button>
            <button
                className='md:hidden flex border-base-300 btn-outline size-9 text-base-content/70 btn btn-sm btn-square btn-ghost'
                aria-label='Search'
                onClick={showModal}
            >
                <Icon icon='lucide--search' className='size-4' />
            </button>
            <dialog ref={dialogRef} className='p-0 modal'>
                <div className='bg-transparent shadow-none p-0 modal-box'>
                    <div className='bg-base-100 rounded-box'>
                        <div className='border-0 !outline-none w-full input'>
                            <Icon icon='lucide--search' className='size-4.5 text-base-content/60' />
                            <input type='search' className='grow' placeholder='Search' aria-label='Search' />
                            <form method='dialog'>
                                <button className='btn btn-xs btn-circle btn-ghost' aria-label='Close'>
                                    <Icon icon='lucide--x' className='size-4 text-base-content/80' />
                                </button>
                            </form>
                        </div>
                        {/* Additional body content intentionally omitted (unchanged) */}
                    </div>
                </div>
                <form method='dialog' className='modal-backdrop'>
                    <button>close</button>
                </form>
            </dialog>
        </>
    )
}

export default TopbarSearchButton
