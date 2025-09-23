import type { ComponentProps } from 'react'
import { Icon } from '@/components/atoms/Icon'

export type TopbarRightbarButtonProps = ComponentProps<'label'>

export const TopbarRightbarButton = ({ className, ...rest }: TopbarRightbarButtonProps) => (
    <label
        htmlFor='layout-rightbar-drawer'
        className={`btn btn-circle btn-ghost btn-sm drawer-button ${className ?? ''}`}
        {...rest}
    >
        <Icon icon='lucide--settings-2' className='size-4.5' />
    </label>
)

export default TopbarRightbarButton
