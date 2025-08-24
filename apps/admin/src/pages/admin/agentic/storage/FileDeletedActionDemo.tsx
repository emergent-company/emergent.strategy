import { ActionDropdown } from "./ActionDropdown";

export const FileDeletedActionDemo = () => {
    return (
        <div className="card bg-base-100 shadow">
            <div className="flex items-center gap-3 px-4 py-2.5">
                <span className="iconify lucide--archive size-4"></span>
                <p className="grow font-medium">Moved to Bin</p>
                <p className="text-base-content/40 text-xs font-medium max-sm:hidden">This week</p>
                <ActionDropdown />
            </div>
            <div className="border-base-300 border-t border-dashed px-4 py-2.5">
                <p className="text-base-content/60 line-clamp-1 text-sm">Delete "OldNotes.docx" from Project folder</p>
                <p className="mt-3 font-medium">File sent to Bin</p>
                <div className="border-base-200 rounded-box mt-2 flex items-start gap-3 border p-3">
                    <span className="iconify lucide--file-minus size-6 text-red-500"></span>
                    <div className="grow">
                        <p className="leading-none font-medium line-through">OldNotes.docx</p>
                        <div className="text-base-content/60 mt-1 flex items-center gap-1 text-xs/none">
                            <p>My Drive</p>
                            <span className="iconify lucide--chevron-right size-3"></span>
                            <p>Project</p>
                        </div>
                    </div>
                    <p className="text-base-content/40 text-sm font-medium">3.2 MB</p>
                </div>
            </div>
            <div className="mt-auto flex items-end justify-end gap-2 px-4 pt-2 pb-4">
                <div
                    className="bg-success/10 tooltip text-success flex items-center rounded-full p-0.5"
                    data-tip="Deleted">
                    <span className="iconify lucide--check size-3.5"></span>
                </div>
                <button className="btn btn-sm btn-soft btn-primary ms-auto gap-2">
                    <span className="iconify lucide--rotate-ccw size-4"></span>
                    Restore File
                </button>
            </div>
        </div>
    );
};
