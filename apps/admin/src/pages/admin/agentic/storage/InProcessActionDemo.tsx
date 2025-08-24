import { ActionDropdown } from "./ActionDropdown";

export const InProcessActionDemo = () => {
    return (
        <div className="card bg-base-100 shadow">
            <div className="flex items-center gap-3 px-4 py-2.5">
                <span className="iconify lucide--text size-4"></span>
                <p className="grow font-medium">Summarize Document</p>
                <p className="text-base-content/40 text-xs font-medium max-sm:hidden">2 minutes ago</p>
                <ActionDropdown />
            </div>
            <div className="border-base-300 border-t border-dashed px-4 py-2.5">
                <p className="text-base-content/60 text-sm">
                    Explain contents of <span className="cursor-pointer underline">abc.doc</span>
                </p>
                <p className="mt-3 font-medium">Generating summary…</p>
                <div className="mt-2 flex flex-col gap-1.5">
                    <div className="rounded-box skeleton h-3 w-[50%]"></div>
                    <div className="rounded-box skeleton h-3 w-[75%]"></div>
                </div>
            </div>
            <div className="mt-auto flex items-end gap-2 px-4 pt-2 pb-4">
                <div className="tooltip" data-tip="In Process">
                    <span className="iconify lucide--loader text-base-content/60 block size-4 animate-spin"></span>
                </div>
                <button className="btn btn-sm ms-auto gap-2 border-none">
                    <span className="iconify lucide--pause size-4"></span>
                    Pause
                </button>
                <button className="btn btn-sm btn-error gap-2 border-none">
                    <span className="iconify lucide--x-square size-4"></span>
                    Cancel
                </button>
            </div>
        </div>
    );
};
