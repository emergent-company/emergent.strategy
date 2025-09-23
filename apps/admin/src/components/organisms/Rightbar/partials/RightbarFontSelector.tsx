import React from 'react'
import { IConfig, useConfig } from '@/contexts/config'

const fontFamilies: { value: IConfig['fontFamily']; label: string; className?: string }[] = [
    { value: 'dm-sans', label: 'DM Sans', className: 'group-[[data-font-family=dm-sans]]/html:bg-base-200' },
    { value: 'wix', label: 'Wix', className: 'group-[[data-font-family=wix]]/html:bg-base-200' },
    {
        value: 'inclusive',
        label: 'Inclusive',
        className:
            'group-[[data-font-family=inclusive]]/html:bg-base-200 group-[:not([data-font-family])]/html:bg-base-200'
    },
    { value: 'ar-one', label: 'AR One', className: 'group-[[data-font-family=ar-one]]/html:bg-base-200' }
]

export const RightbarFontSelector: React.FC = () => {
    const { changeFontFamily } = useConfig()
    return (
        <div>
            <p className="mt-6 font-medium">Font Family</p>
            <div className="gap-3 grid grid-cols-2 mt-3">
                {fontFamilies.map((item) => (
                    <div
                        key={item.value}
                        className={
                            'border-base-300 hover:bg-base-200 rounded-box inline-flex cursor-pointer items-center justify-center gap-2 border p-2 ' +
                            item.className
                        }
                        onClick={() => changeFontFamily(item.value)}
                    >
                        <p data-font-family={item.value} className="font-sans">
                            {item.label}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    )
}

export default RightbarFontSelector
