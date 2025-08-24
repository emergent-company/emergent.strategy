import { ActionDropdown } from "./ActionDropdown";

export const PermissionUpdatedActionDemo = () => {
    return (
        <div className="card bg-base-100 shadow">
            <div className="flex items-center gap-3 px-4 py-2.5">
                <span className="iconify lucide--shield-user size-4"></span>
                <p className="grow font-medium">Permissions Updated</p>
                <p className="text-base-content/40 text-xs font-medium max-sm:hidden">3 weeks ago</p>
                <ActionDropdown />
            </div>
            <div className="border-base-300 border-t border-dashed px-4 py-2.5">
                <p className="text-base-content/60 line-clamp-1 text-sm">
                    Grant edit access for “ABC.pdf” to Marketing Team
                </p>
                <p className="mt-3 font-medium">Shared securely with individuals</p>
                <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-3">
                        <div className="avatar bg-base-200 size-7 overflow-hidden rounded-full px-1 pt-1">
                            <img src="/images/avatars/1.png" alt="Avatar" />
                        </div>
                        <p className="grow font-medium">Anthony S. Amaya</p>
                        <span className="text-base-content/60 text-sm">Can Edit</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="avatar bg-base-200 size-7 overflow-hidden rounded-full px-1 pt-1">
                            <img src="/images/avatars/2.png" alt="Avatar" />
                        </div>
                        <p className="grow font-medium">Crystal R. Taylor</p>
                        <span className="text-base-content/60 text-sm">Can View</span>
                    </div>
                </div>
            </div>
            <div className="mt-auto flex items-end justify-end gap-2 px-4 pt-2 pb-4">
                <div
                    className="bg-success/10 tooltip text-success flex items-center rounded-full p-0.5"
                    data-tip="Permissions updated">
                    <span className="iconify lucide--check size-3.5"></span>
                </div>
                <button className="btn btn-sm btn-soft btn-error ms-auto gap-2">
                    <span className="iconify lucide--undo-2 size-4"></span>
                    Revoke Access
                </button>
            </div>
        </div>
    );
};
