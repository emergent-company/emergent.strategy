import { ActionDropdown } from "./ActionDropdown";

export const NeedConfirmationActionDemo = () => {
    return (
        <div className="card bg-base-100 shadow">
            <div className="flex items-center gap-3 px-4 py-2.5">
                <span className="iconify lucide--shield-ellipsis size-4"></span>
                <p className="grow font-medium">Scan for Sensitive Data</p>
                <p className="text-base-content/40 text-xs font-medium max-sm:hidden">Awaiting</p>
                <ActionDropdown />
            </div>
            <div className="border-base-300 border-t border-dashed px-4 py-2.5">
                <p className="text-base-content/60 text-sm">Scan selected files for sensitive or confidential data</p>
                <p className="mt-3 font-medium">Waiting for your confirmation</p>
                <p className="text-base-content/80 mt-2 text-sm">Permission required to access private folders</p>
            </div>
            <div className="mt-auto flex items-end gap-2 px-4 pt-2 pb-4">
                <div className="tooltip" data-tip="Awaiting Approval">
                    <span className="iconify lucide--circle-question-mark text-base-content/60 block size-4"></span>
                </div>
                <button className="btn btn-sm ms-auto gap-2 border-none">
                    <span className="iconify lucide--x size-4"></span>
                    Deny
                </button>
                <button className="btn btn-sm btn-primary gap-2 border-none">
                    <span className="iconify lucide--check size-4"></span>
                    Allow
                </button>
            </div>
        </div>
    );
};
