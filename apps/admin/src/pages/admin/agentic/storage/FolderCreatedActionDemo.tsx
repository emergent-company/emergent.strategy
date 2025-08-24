import { ActionDropdown } from "./ActionDropdown";

export const FolderCreatedActionDemo = () => {
    return (
        <div className="card bg-base-100 shadow">
            <div className="flex items-center gap-3 px-4 py-2.5">
                <span className="iconify lucide--folder-plus size-4"></span>
                <p className="grow font-medium">Folder Created</p>
                <p className="text-base-content/40 text-xs font-medium max-sm:hidden">Yesterday</p>
                <ActionDropdown />
            </div>
            <div className="border-base-300 border-t border-dashed px-4 py-2.5">
                <p className="text-base-content/60 line-clamp-1 text-sm">Create "2025 Projects" in Work</p>
                <p className="mt-3 font-medium">2025 Projects is ready</p>
                <div className="border-base-200 rounded-box mt-2 flex items-start gap-3 border p-3">
                    <span className="iconify lucide--folder-check size-6 text-orange-500"></span>
                    <div className="grow">
                        <p className="leading-none font-medium">2025 Projects</p>
                        <p className="text-base-content/60 mt-1 flex items-center gap-1 text-xs/none">My Drive</p>
                    </div>
                    <span className="iconify lucide--lock text-base-content/60 size-3.5"></span>
                </div>
            </div>
            <div className="mt-auto flex items-end justify-end gap-2 px-4 pt-2 pb-4">
                <div
                    className="bg-success/10 tooltip text-success flex items-center rounded-full p-0.5"
                    data-tip="Folder created">
                    <span className="iconify lucide--check size-3.5"></span>
                </div>
                <button className="btn btn-sm btn-soft ms-auto gap-2">
                    <span className="iconify lucide--folder-open size-4"></span>
                    Go to Folder
                </button>
            </div>
        </div>
    );
};
