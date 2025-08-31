import { ActionDropdown } from "./ActionDropdown";
import { Icon } from "@/components/ui/Icon";

export const PermissionUpdatedActionDemo = () => {
    return (
        <div className="bg-base-100 shadow card">
            <div className="flex items-center gap-3 px-4 py-2.5">
                <Icon icon="lucide--shield-user" className="size-4" />
                <p className="font-medium grow">Permissions Updated</p>
                <p className="max-sm:hidden font-medium text-xs text-base-content/40">3 weeks ago</p>
                <ActionDropdown />
            </div>
            <div className="px-4 py-2.5 border-t border-base-300 border-dashed">
                <p className="text-sm text-base-content/60 line-clamp-1">
                    Grant edit access for “ABC.pdf” to Marketing Team
                </p>
                <p className="mt-3 font-medium">Shared securely with individuals</p>
                <div className="space-y-1 mt-2">
                    <div className="flex items-center gap-3">
                        <div className="bg-base-200 px-1 pt-1 rounded-full size-7 overflow-hidden avatar">
                            <img src="/images/avatars/1.png" alt="Avatar" />
                        </div>
                        <p className="font-medium grow">Anthony S. Amaya</p>
                        <span className="text-sm text-base-content/60">Can Edit</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="bg-base-200 px-1 pt-1 rounded-full size-7 overflow-hidden avatar">
                            <img src="/images/avatars/2.png" alt="Avatar" />
                        </div>
                        <p className="font-medium grow">Crystal R. Taylor</p>
                        <span className="text-sm text-base-content/60">Can View</span>
                    </div>
                </div>
            </div>
            <div className="flex justify-end items-end gap-2 mt-auto px-4 pt-2 pb-4">
                <div
                    className="flex items-center bg-success/10 p-0.5 rounded-full text-success tooltip"
                    data-tip="Permissions updated">
                    <Icon icon="lucide--check" className="size-3.5" />
                </div>
                <button className="gap-2 ms-auto btn btn-sm btn-soft btn-error">
                    <Icon icon="lucide--undo-2" className="size-4" />
                    Revoke Access
                </button>
            </div>
        </div>
    );
};
