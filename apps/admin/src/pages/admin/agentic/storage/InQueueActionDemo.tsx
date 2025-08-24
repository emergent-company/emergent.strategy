import { ActionDropdown } from "./ActionDropdown";

export const InQueueActionDemo = () => {
    return (
        <div className="card bg-base-100 shadow">
            <div className="flex items-center gap-3 px-4 py-2.5">
                <span className="iconify lucide--brush-cleaning size-4"></span>
                <p className="grow font-medium">Auto-Clean Storage</p>
                <p className="text-base-content/40 text-xs font-medium max-sm:hidden">Now</p>
                <ActionDropdown />
            </div>
            <div className="border-base-300 border-t border-dashed px-4 py-2.5">
                <p className="text-base-content/60 text-sm">Scan storage for duplicates and suggest deletions</p>
                <p className="mt-3 font-medium">In Queue</p>
                <p className="text-base-content/80 mt-2 text-sm">
                    This task will start after the document summary finishes, or you can start it now.
                </p>
            </div>
            <div className="mt-auto flex items-end gap-2 px-4 pt-2 pb-4">
                <div className="tooltip" data-tip="Queued">
                    <span className="iconify lucide--list-start text-base-content/60 block size-4"></span>
                </div>
                <button className="btn btn-sm btn-soft btn-primary ms-auto gap-2 border-none">
                    <span className="iconify lucide--play size-4"></span>
                    Run Now
                </button>
            </div>
        </div>
    );
};
