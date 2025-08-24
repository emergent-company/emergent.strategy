import { ActionDropdown } from "./ActionDropdown";

export const ErrorActionDemo = () => {
    return (
        <div className="card bg-base-100 shadow">
            <div className="flex items-center gap-3 px-4 py-2.5">
                <span className="iconify lucide--folder-pen size-4"></span>
                <p className="grow font-medium">Auto Rename Files</p>
                <p className="text-base-content/40 text-xs font-medium max-sm:hidden">6 hours ago</p>
                <ActionDropdown />
            </div>
            <div className="border-base-300 border-t border-dashed px-4 py-2.5">
                <p className="text-base-content/60 text-sm">Suggest cleaner file names based on content</p>
                <p className="mt-3 font-medium">Name Conflict Detected</p>
                <p className="text-base-content/80 mt-2 text-sm">
                    Duplicate file names detected in the folder. Please resolve to continue.
                </p>
            </div>
            <div className="mt-auto flex items-end gap-2 px-4 pt-2 pb-4">
                <div className="tooltip text-error tooltip-error" data-tip="Conflict Detected">
                    <span className="iconify lucide--triangle-alert block size-3.5"></span>
                </div>
                <button className="btn btn-sm ms-auto gap-2 border-none">
                    <span className="iconify lucide--list-todo size-4"></span>
                    See Duplicates
                </button>
            </div>
        </div>
    );
};
