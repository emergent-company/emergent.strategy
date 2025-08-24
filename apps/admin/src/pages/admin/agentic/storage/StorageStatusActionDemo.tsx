import { ActionDropdown } from "./ActionDropdown";

export const StorageStatusActionDemo = () => {
    return (
        <div className="card bg-base-100 shadow">
            <div className="flex items-center gap-3 px-4 py-2.5">
                <span className="iconify lucide--hard-drive size-4"></span>
                <p className="grow font-medium">Storage Status</p>
                <p className="text-base-content/40 text-xs font-medium max-sm:hidden">Just checked</p>
                <ActionDropdown />
            </div>
            <div className="border-base-300 border-t border-dashed px-4 py-2.5">
                <p className="text-base-content/60 text-sm">How much space is left?</p>
                <p className="mt-3 font-medium">Your drive is almost full</p>
                <div className="border-base-200 rounded-box mt-2 border p-3">
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">My Drive</p>
                        <span className="text-base-content/80 text-xs">92%</span>
                    </div>
                    <progress
                        max="250"
                        value="230"
                        className="progress progress-error mt-1.5 h-1.5 align-super"></progress>
                    <div className="-mt-1.5 flex items-center justify-between">
                        <span className="text-sm font-medium">230 GB</span>
                        <span className="text-base-content/80 text-xs">250 GB</span>
                    </div>
                </div>
            </div>
            <div className="mt-auto flex items-end justify-end gap-2 px-4 pt-2 pb-4">
                <div
                    className="bg-success/10 tooltip text-success flex items-center rounded-full p-0.5"
                    data-tip="Storage checked">
                    <span className="iconify lucide--check size-3.5"></span>
                </div>
                <button className="btn btn-sm from-primary to-secondary text-primary-content ms-auto gap-2 border-none bg-linear-to-br">
                    <span className="iconify lucide--wand-2 size-4"></span>
                    Upgrade Plan
                </button>
            </div>
        </div>
    );
};
