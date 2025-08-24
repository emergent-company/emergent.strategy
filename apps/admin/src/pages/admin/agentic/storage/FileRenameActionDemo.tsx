import { ActionDropdown } from "./ActionDropdown";

export const FileRenameActionDemo = () => {
    return (
        <div className="card bg-base-100 shadow">
            <div className="flex items-center gap-3 px-4 py-2.5">
                <span className="iconify lucide--file-pen size-4"></span>
                <p className="grow font-medium">File Renamed</p>
                <p className="text-base-content/40 text-xs font-medium max-sm:hidden">2 days ago</p>
                <ActionDropdown />
            </div>
            <div className="border-base-300 border-t border-dashed px-4 py-2.5">
                <p className="text-base-content/60 line-clamp-1 text-sm">
                    "Draft.txt" renamed to "Final Doc.txt" in Reports
                </p>
                <p className="mt-3 font-medium">Name updated</p>
                <div className="border-base-200 rounded-box mt-2 flex items-start gap-3 border p-3">
                    <span className="iconify lucide--file-symlink size-6 text-yellow-600"></span>
                    <div className="grow">
                        <p className="leading-none font-medium">
                            <span className="text-base-content/60 text-sm line-through">Draft.txt</span>
                            <span className="ms-2">Final Doc.txt</span>
                        </p>
                        <div className="text-base-content/60 mt-1 flex items-center gap-1 text-xs/none">
                            <p>My Drive</p>
                            <span className="iconify lucide--chevron-right size-3"></span>
                            <p>Reports </p>
                        </div>
                    </div>
                    <span className="iconify lucide--globe text-base-content/60 size-3.5"></span>
                </div>
            </div>
            <div className="mt-auto flex items-end justify-end gap-2 px-4 pt-2 pb-4">
                <div
                    className="bg-success/10 tooltip text-success flex items-center rounded-full p-0.5"
                    data-tip="Rename successful">
                    <span className="iconify lucide--check size-3.5"></span>
                </div>
                <button className="btn btn-sm btn-soft ms-auto gap-2">
                    <span className="iconify lucide--file-sliders size-4"></span>
                    Manage File
                </button>
            </div>
        </div>
    );
};
