import { useRef } from "react";

export const FileSearchDemo = () => {
    const dialogRef = useRef<HTMLDialogElement>(null);

    const showModal = () => {
        if (dialogRef.current) {
            dialogRef.current.showModal();
        }
    };

    return (
        <>
            <button onClick={showModal} role="button" className="btn btn-circle btn-soft" aria-label="Notifications">
                <span className="iconify lucide--search size-5" />
            </button>
            <dialog id="search-modal-demo-2" ref={dialogRef} className="modal p-0">
                <div className="modal-box bg-transparent p-0 shadow-none">
                    <div className="bg-base-100 rounded-box">
                        <div className="input w-full border-0 !outline-none">
                            <span className="iconify lucide--search text-base-content/60 size-4.5" />
                            <input
                                type="search"
                                className="grow"
                                placeholder="Search files, folders, or tags"
                                aria-label="Search"
                            />
                            <form method="dialog">
                                <button className="btn btn-xs btn-circle btn-ghost" aria-label="Close">
                                    <span className="iconify lucide--x text-base-content/80 size-4" />
                                </button>
                            </form>
                        </div>
                    </div>

                    <div className="bg-base-100 rounded-box mt-4">
                        <div className="px-5 py-3">
                            <div className="mt-2 flex flex-wrap gap-2">
                                <select className="select select-sm w-24" defaultValue="-1">
                                    <option disabled value="-1">
                                        Sort by
                                    </option>
                                    <option>Name</option>
                                    <option>Last Modified</option>
                                    <option>Type</option>
                                </select>
                                <select className="select select-sm w-24" defaultValue="-1">
                                    <option disabled value="-1">
                                        Type
                                    </option>
                                    <option>Documents</option>
                                    <option>Folders</option>
                                    <option>Shared</option>
                                </select>
                                <select className="select select-sm w-24" defaultValue="-1">
                                    <option disabled value="-1">
                                        Owner
                                    </option>
                                    <option>Me</option>
                                    <option>Team</option>
                                    <option>External</option>
                                </select>
                            </div>
                        </div>

                        <ul className="menu menu-sm w-full pt-0">
                            <li className="menu-title">Recent searches</li>
                            <li>
                                <div>
                                    <span className="iconify lucide--clock size-4 opacity-80" />
                                    <p className="text-sm">Quarterly Report.pdf</p>
                                    <span className="text-xs opacity-60">2 hours ago</span>
                                </div>
                            </li>
                            <li>
                                <div>
                                    <span className="iconify lucide--clock size-4 opacity-80" />
                                    <p className="text-sm">Brand Guidelines</p>
                                    <span className="text-xs opacity-60">Today, 9:12 AM</span>
                                </div>
                            </li>
                            <li>
                                <div>
                                    <span className="iconify lucide--clock size-4 opacity-80" />
                                    <p className="text-sm">Invoices Folder</p>
                                    <span className="text-xs opacity-60">Yesterday</span>
                                </div>
                            </li>
                        </ul>

                        <hr className="border-base-300 h-px border-dashed" />

                        <ul className="menu w-full pt-1">
                            <li className="menu-title">Files & Folders</li>

                            <li>
                                <div>
                                    <span className="iconify lucide--file-text size-4 opacity-80" />
                                    <p className="text-sm">Invoice_March2025.pdf</p>
                                    <div className="badge badge-sm gap-1.5">
                                        <span className="iconify lucide--calendar size-3"></span>
                                        Finance
                                    </div>
                                </div>
                            </li>
                            <li>
                                <div>
                                    <span className="iconify lucide--folder size-4 opacity-80" />
                                    <p className="text-sm">Marketing Assets</p>
                                    <div className="badge badge-sm gap-1.5">
                                        <span className="iconify lucide--users size-3"></span>
                                        Shared
                                    </div>
                                </div>
                            </li>
                            <li>
                                <div>
                                    <span className="iconify lucide--file-spreadsheet size-4 opacity-80" />
                                    <p className="text-sm">Q2_Expenses.xlsx</p>
                                    <div className="badge badge-sm gap-1.5">
                                        <span className="iconify lucide--bar-chart size-3"></span>
                                        Reports
                                    </div>
                                </div>
                            </li>
                            <li>
                                <div>
                                    <span className="iconify lucide--folder size-4 opacity-80" />
                                    <p className="text-sm">Archived Projects</p>
                                    <div className="badge badge-sm gap-1.5">
                                        <span className="iconify lucide--archive size-3"></span>
                                        Internal
                                    </div>
                                </div>
                            </li>
                            <li>
                                <div>
                                    <span className="iconify lucide--file-image size-4 opacity-80" />
                                    <p className="text-sm">UI_Screens_2025.png</p>
                                    <div className="badge badge-sm gap-1.5">
                                        <span className="iconify lucide--brush size-3"></span>
                                        Design
                                    </div>
                                </div>
                            </li>
                        </ul>

                        <div className="border-base-300 flex items-center gap-3 border-t p-3">
                            <div className="flex items-center gap-0.5">
                                <div className="border-base-300 bg-base-200 flex size-5 items-center justify-center rounded-sm border shadow-xs">
                                    <span className="iconify lucide--arrow-up size-3.5"></span>
                                </div>
                                <div className="border-base-300 bg-base-200 flex size-5 items-center justify-center rounded-sm border shadow-xs">
                                    <span className="iconify lucide--arrow-down size-3.5"></span>
                                </div>
                                <p className="text-base-content/80 ms-1 text-sm">Navigate</p>
                            </div>
                            <div className="flex items-center gap-0.5">
                                <div className="border-base-300 bg-base-200 flex size-5 items-center justify-center rounded-sm border shadow-xs">
                                    <span className="iconify lucide--corner-down-left size-3.5"></span>
                                </div>
                                <p className="text-base-content/80 ms-1 text-sm">Open</p>
                            </div>
                            <div className="ms-auto flex items-center gap-0.5">
                                <div className="border-base-300 bg-base-200 flex h-5 items-center justify-center rounded-sm border px-1 text-sm/none shadow-xs">
                                    esc
                                </div>
                                <p className="text-base-content/80 ms-1 text-sm">Close</p>
                            </div>
                        </div>
                    </div>
                </div>

                <form method="dialog" className="modal-backdrop">
                    <button>close</button>
                </form>
            </dialog>
        </>
    );
};
