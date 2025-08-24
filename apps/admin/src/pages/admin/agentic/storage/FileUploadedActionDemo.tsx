import { ActionDropdown } from "./ActionDropdown";

export const FileUploadedActionDemo = () => {
    return (
        <div className="card bg-base-100 shadow">
            <div className="flex items-center gap-3 px-4 py-2.5">
                <span className="iconify lucide--upload-cloud size-4"></span>
                <p className="grow font-medium">File Uploaded</p>
                <p className="text-base-content/40 text-xs font-medium max-sm:hidden">3 hours ago</p>
                <ActionDropdown />
            </div>
            <div className="border-base-300 border-t border-dashed px-4 py-2.5">
                <p className="text-base-content/60 text-sm">Uploaded "Invoice.pdf" to Reports</p>
                <p className="mt-3 font-medium">Uploading done</p>
                <div className="border-base-200 rounded-box mt-2 flex items-start gap-3 border p-3">
                    <span className="iconify lucide--file-up size-6 text-yellow-600"></span>
                    <div className="grow">
                        <p className="leading-none font-medium">Invoice.pdf</p>
                        <div className="text-base-content/60 mt-1 flex items-center gap-1 text-xs/none">
                            <p>My Drive</p>
                            <span className="iconify lucide--chevron-right size-3"></span>
                            <p>Reports </p>
                        </div>
                    </div>
                    <p className="text-base-content/40 text-sm font-medium">3.2 MB</p>
                </div>
            </div>
            <div className="mt-auto flex items-end justify-end gap-2 px-4 pt-2 pb-4">
                <div
                    className="bg-success/10 tooltip text-success flex items-center rounded-full p-0.5"
                    data-tip="Upload successful">
                    <span className="iconify lucide--check size-3.5"></span>
                </div>
                <button className="btn btn-sm btn-soft ms-auto gap-2">
                    <span className="iconify lucide--file-pen size-4"></span>
                    Rename File
                </button>
            </div>
        </div>
    );
};
