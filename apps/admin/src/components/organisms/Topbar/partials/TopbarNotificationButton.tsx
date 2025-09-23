import React, { useState } from 'react'
import { Icon } from '@/components/atoms/Icon'

export const TopbarNotificationButton: React.FC = () => {
    const [step] = useState(1) // reserved for future multi-step notification UI
    const closeMenu = () => (document.activeElement instanceof HTMLElement) && document.activeElement.blur()
    return (
        <div className='dropdown-bottom dropdown sm:dropdown-end dropdown-center'>
            <div
                tabIndex={0}
                role='button'
                className='relative btn btn-circle btn-ghost btn-sm'
                aria-label='Notifications'
            >
                <Icon icon='lucide--bell' className='size-4.5 motion-preset-seesaw' />
                <div className='top-1 absolute status status-error status-sm end-1'></div>
            </div>
            <div
                tabIndex={0}
                className='bg-base-100 shadow-md hover:shadow-lg mt-1 rounded-box w-84 duration-1000 dropdown-content'
            >
                <div className='bg-base-200/30 ps-4 pe-2 pt-3 border-b border-base-200 rounded-t-box'>
                    <div className='flex justify-between items-center'>
                        <p className='font-medium'>Notification</p>
                        <button
                            className='btn btn-xs btn-circle btn-ghost'
                            aria-label='Close'
                            onClick={closeMenu}
                        >
                            <Icon icon='lucide--x' className='size-4' />
                        </button>
                    </div>
                </div>
                {/* Rest of notification list intentionally omitted */}
            </div>
        </div>
    )
}

export default TopbarNotificationButton
