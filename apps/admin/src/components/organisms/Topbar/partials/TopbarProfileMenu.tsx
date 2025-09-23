import React, { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useOrganizations } from '@/hooks/use-organizations'
import { useConfig } from '@/contexts/config'
import { useAuth } from '@/contexts/auth'
import { Icon } from '@/components/atoms/Icon'

export const TopbarProfileMenu: React.FC = () => {
    const { orgs, loading, error, createOrg } = useOrganizations()
    const { config, setActiveOrg } = useConfig()
    const { logout } = useAuth()
    const [orgName, setOrgName] = useState<string>('')
    const [creating, setCreating] = useState<boolean>(false)
    const [createError, setCreateError] = useState<string | undefined>(undefined)
    const [toastMsg, setToastMsg] = useState<string | undefined>(undefined)

    const activeOrgId = config.activeOrgId
    const activeOrgName = config.activeOrgName
    const orgsSorted = useMemo(() => (orgs ? [...orgs].sort((a, b) => a.name.localeCompare(b.name)) : []), [orgs])

    const onSelectOrg = (id: string, name: string) => {
        setActiveOrg(id, name)
        setToastMsg(`Switched to ${name}`)
        window.setTimeout(() => setToastMsg(undefined), 2500)
    }

    const onCreateOrg = async () => {
        if (!orgName.trim()) return
        try {
            setCreating(true)
            setCreateError(undefined)
            const created = await createOrg(orgName.trim())
            setActiveOrg(created.id, created.name)
            setOrgName('')
                ; (document.getElementById('modal-create-org') as HTMLInputElement | null)?.click?.()
            setToastMsg(`Organization “${created.name}” created`)
            window.setTimeout(() => setToastMsg(undefined), 2500)
        } catch (e) {
            setCreateError((e as Error).message || 'Failed to create organization')
        } finally {
            setCreating(false)
        }
    }

    return (
        <div className='dropdown-bottom ms-1 dropdown dropdown-end' data-testid='profile-menu'>
            <div tabIndex={0} className='cursor-pointer' data-testid='avatar-trigger'>
                <div className='bg-base-200 rounded-full ring ring-success size-7 overflow-hidden avatar'>
                    <img src='/images/avatars/1.png' alt='Avatar' data-testid='avatar-image' />
                </div>
            </div>
            <div tabIndex={0} className='bg-base-100 shadow mt-2 rounded-box w-44 dropdown-content'>
                <ul className='p-2 w-full menu'>
                    <li>
                        <Link to='#'>
                            <Icon icon='lucide--user' className='size-4' />
                            <span>My Profile</span>
                        </Link>
                    </li>
                    <li>
                        <Link to='#'>
                            <Icon icon='lucide--settings' className='size-4' />
                            <span>Settings</span>
                        </Link>
                    </li>
                    <li>
                        <Link to='#'>
                            <Icon icon='lucide--help-circle' className='size-4' />
                            <span>Help</span>
                        </Link>
                    </li>
                </ul>
                <div className='opacity-70 px-3 pt-2 pb-1 text-xs'>Organizations</div>
                <ul className='p-2 pt-0 w-full max-h-60 overflow-auto menu'>
                    {loading && (
                        <li className='disabled'>
                            <div className='flex items-center gap-2'>
                                <span className='rounded w-4 h-4 skeleton' />
                                <span className='w-24 h-3 skeleton' />
                            </div>
                        </li>
                    )}
                    {!loading && orgsSorted.length === 0 && (
                        <li className='disabled'>
                            <div className='opacity-70'>No organizations</div>
                        </li>
                    )}
                    {!loading &&
                        orgsSorted.map((o) => (
                            <li key={o.id}>
                                <button
                                    className='flex justify-between items-center'
                                    onClick={() => onSelectOrg(o.id, o.name)}
                                    aria-current={o.id === activeOrgId ? 'true' : undefined}
                                >
                                    <div className='flex items-center gap-2'>
                                        <Icon icon='lucide--building-2' className='size-4' />
                                        <span className='truncate' title={o.name}>
                                            {o.name}
                                        </span>
                                    </div>
                                    {o.id === activeOrgId && <Icon icon='lucide--check' className='size-4' aria-hidden />}
                                </button>
                            </li>
                        ))}
                </ul>
                <div className='px-2 pt-0 pb-2'>
                    <label htmlFor='modal-create-org' className='link link-primary'>
                        Add organization
                    </label>
                </div>
                <hr className='border-base-300' />
                <ul className='p-2 w-full menu'>
                    <li>
                        <div>
                            <Icon icon='lucide--arrow-left-right' className='size-4' />
                            <span>Switch Account</span>
                        </div>
                    </li>
                    <li>
                        <button
                            type='button'
                            onClick={logout}
                            className='flex items-center hover:bg-error/10 text-error'
                            aria-label='Logout'
                        >
                            <Icon icon='lucide--log-out' className='size-4' />
                            <span>Logout</span>
                        </button>
                    </li>
                </ul>
            </div>
            <input type='checkbox' id='modal-create-org' className='modal-toggle' />
            <div className='modal' role='dialog' aria-modal='true'>
                <div className='modal-box'>
                    <h3 className='font-bold text-lg'>Create Organization</h3>
                    {(error || createError) && (
                        <div className='mt-2 alert alert-error'>
                            <Icon icon='lucide--alert-triangle' className='size-4' />
                            <span>{createError || error}</span>
                        </div>
                    )}
                    <div className='mt-4 form-control'>
                        <label className='label'>
                            <span className='label-text'>Organization name</span>
                        </label>
                        <input
                            className='input'
                            placeholder='Acme Inc'
                            value={orgName}
                            maxLength={100}
                            onChange={(e) => setOrgName(e.target.value)}
                        />
                    </div>
                    <div className='modal-action'>
                        <label htmlFor='modal-create-org' className='btn btn-ghost'>
                            Cancel
                        </label>
                        <button
                            className='btn btn-primary'
                            onClick={onCreateOrg}
                            disabled={creating || !orgName.trim()}
                        >
                            {creating && <span className='me-2 loading loading-spinner loading-sm' />}
                            Create
                        </button>
                    </div>
                </div>
                <label className='modal-backdrop' htmlFor='modal-create-org'>
                    Close
                </label>
            </div>
            {toastMsg && (
                <div className='toast-top toast toast-end'>
                    <div className='alert alert-success'>
                        <Icon icon='lucide--check-circle-2' className='size-4' />
                        <span>{toastMsg}</span>
                    </div>
                </div>
            )}
        </div>
    )
}

export default TopbarProfileMenu
