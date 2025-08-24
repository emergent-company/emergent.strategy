import { ActionDropdown } from "./ActionDropdown";

export const FileSharedActionDemo = () => {
    return (
        <div className="card bg-base-100 shadow">
            <div className="flex items-center gap-3 px-4 py-2.5">
                <span className="iconify lucide--share-2 size-4"></span>
                <p className="grow font-medium">File Shared</p>
                <p className="text-base-content/40 text-xs font-medium max-sm:hidden">14 minutes ago</p>
                <ActionDropdown />
            </div>
            <div className="border-base-300 border-t border-dashed px-4 py-2.5">
                <p className="text-base-content/60 text-sm">Shared "ProjectPlan.docx" with Design Team </p>
                <p className="mt-3 font-medium">File shared securely with</p>
                <div className="avatar-group mt-2 -space-x-3.5 *:border-2 *:transition-all hover:space-x-0.5 hover:*:shadow-sm">
                    <div className="avatar bg-base-200 size-10 overflow-hidden rounded-full px-1 pt-1">
                        <img src="/images/avatars/1.png" alt="Avatar" />
                    </div>
                    <div className="avatar bg-base-200 size-10 overflow-hidden rounded-full px-1 pt-1">
                        <img src="/images/avatars/2.png" alt="Avatar" />
                    </div>
                    <div className="avatar bg-base-200 size-10 overflow-hidden rounded-full px-1 pt-1">
                        <img src="/images/avatars/3.png" alt="Avatar" />
                    </div>
                    <div className="avatar bg-base-200 size-10 overflow-hidden rounded-full px-1 pt-1">
                        <img src="/images/avatars/4.png" alt="Avatar" />
                    </div>
                    <div className="avatar bg-base-200 flex size-10 items-center justify-center overflow-hidden rounded-full text-sm font-medium">
                        +4
                    </div>
                </div>
            </div>
            <div className="mt-auto flex items-end justify-end gap-2 px-4 pt-2 pb-4">
                <div
                    className="bg-success/10 tooltip text-success flex items-center rounded-full p-0.5"
                    data-tip="Shared successfully">
                    <span className="iconify lucide--check size-3.5"></span>
                </div>
                <button className="btn btn-sm btn-soft ms-auto gap-2">
                    <span className="iconify lucide--copy size-4"></span>
                    Copy Share Link
                </button>
            </div>
        </div>
    );
};
