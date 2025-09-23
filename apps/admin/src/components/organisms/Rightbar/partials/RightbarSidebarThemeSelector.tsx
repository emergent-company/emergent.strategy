import React from 'react'
import { useConfig } from '@/contexts/config'
import { Icon } from '@/components/atoms/Icon'

export const RightbarSidebarThemeSelector: React.FC = () => {
    const { changeSidebarTheme } = useConfig()
    return (
        <div className="opacity-50 group-data-[theme=contrast]/html:opacity-100 group-data-[theme=light]/html:opacity-100 pointer-events-none group-data-[theme=contrast]/html:pointer-events-auto group-data-[theme=light]/html:pointer-events-auto">
            <p className="mt-6 font-medium">
                Sidebar
                <span className="group-data-[theme=contrast]/html:hidden group-data-[theme=light]/html:hidden inline ms-1 text-xs md:text-sm">
                    (*Only available in light, contrast themes)
                </span>
            </p>
            <div className="gap-3 grid grid-cols-2 mt-3">
                <div
                    className="inline-flex justify-center items-center gap-2 hover:bg-base-200 group-data-[sidebar-theme=light]/html:bg-base-200 p-2 border border-base-300 rounded-box cursor-pointer"
                    onClick={() => changeSidebarTheme('light')}
                >
                    <Icon icon="lucide--sun" className="size-4.5" ariaLabel="Light sidebar theme" />
                    Light
                </div>
                <div
                    className="inline-flex justify-center items-center gap-2 hover:bg-base-200 group-data-[sidebar-theme=dark]/html:bg-base-200 p-2 border border-base-300 rounded-box cursor-pointer"
                    onClick={() => changeSidebarTheme('dark')}
                >
                    <Icon icon="lucide--moon" className="size-4.5" ariaLabel="Dark sidebar theme" />
                    Dark
                </div>
            </div>
        </div>
    )
}

export default RightbarSidebarThemeSelector
