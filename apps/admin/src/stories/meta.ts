import type { Parameters, Args, ArgTypes, Meta } from '@storybook/react'
import type { ComponentType } from 'react'

interface BaseMetaOptions<T extends ComponentType<any>> {
    title: string
    component: T
    description?: string
    args?: Args
    argTypes?: ArgTypes
    parameters?: Parameters
    decorators?: Meta<any>['decorators']
    tags?: string[]
}

export function makeMeta<T extends ComponentType<any>>(options: BaseMetaOptions<T>): Meta<any> {
    const { title, component, description, args, argTypes, parameters, decorators, tags } = options
    const meta: Meta<any> = {
        title,
        component,
        args,
        argTypes,
        decorators,
        parameters: {
            docs: {
                description: { component: description || '' },
                ...(parameters?.docs ?? {}),
            },
            ...parameters,
        },
        tags: Array.from(new Set(["autodocs", ...(tags || [])])),
    }
    return meta
}
