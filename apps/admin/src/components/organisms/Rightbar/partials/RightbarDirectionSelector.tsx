import React from 'react'
import { useConfig } from '@/contexts/config'
import { Icon } from '@/components/atoms/Icon'

export const RightbarDirectionSelector: React.FC = () => {
    const { changeDirection } = useConfig()
    return (
        <div>
            <p className="mt-6 font-medium">Direction</p>
            <div className="gap-3 grid grid-cols-2 mt-3">
                <div
                    className="border-base-300 hover:bg-base-200 rounded-box group-[[dir=ltr]]/html:bg-base-200 group-[:not([dir])]/html:bg-base-200 inline-flex cursor-pointer items-center justify-center gap-2 border p-2"
                    onClick={() => changeDirection('ltr')}
                >
                    <Icon icon="lucide--pilcrow-left" className="size-4.5" ariaLabel="Left to Right" />
                    <span className="hidden sm:inline">Left to Right</span>
                    <span className="sm:hidden inline">LTR</span>
                </div>
                <div
                    className="inline-flex justify-center items-center gap-2 hover:bg-base-200 group-[[dir=rtl]]/html:bg-base-200 p-2 border border-base-300 rounded-box cursor-pointer"
                    onClick={() => changeDirection('rtl')}
                >
                    <Icon icon="lucide--pilcrow-right" className="size-4.5" ariaLabel="Right to Left" />
                    <span className="hidden sm:inline">Right to Left</span>
                    <span className="sm:hidden inline">RTL</span>
                </div>
            </div>
        </div>
    )
}

export default RightbarDirectionSelector
