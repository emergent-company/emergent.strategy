import type { ComponentProps } from 'react'
import { Icon } from '@/components/atoms/Icon'

export interface TopbarLeftmenuToggleProps extends ComponentProps<'label'> {
    hoverMode?: boolean
}

export const TopbarLeftmenuToggle = ({ hoverMode = false, className, ...rest }: TopbarLeftmenuToggleProps) => {
    const targetId = hoverMode ? 'layout-sidebar-hover-trigger' : 'layout-sidebar-toggle-trigger'
    const base = 'btn btn-square btn-ghost btn-sm'
    const visibility = hoverMode
        ? 'hidden group-has-[[id=layout-sidebar-hover-trigger]:checked]/html:flex'
        : 'group-has-[[id=layout-sidebar-hover-trigger]:checked]/html:hidden'
    return (
        <label
            htmlFor={targetId}
            aria-label='Leftmenu toggle'
            className={`${base} ${visibility} ${className ?? ''}`}
            {...rest}
        >
            <Icon icon='lucide--menu' className='size-5' />
        </label>
    )
}

export default TopbarLeftmenuToggle
