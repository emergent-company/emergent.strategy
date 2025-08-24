import { useRef } from "react";

export const DocumentationSearchDemo = () => {
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
            <dialog id="search-modal-demo-8" ref={dialogRef} className="modal p-0">
                <div className="modal-box bg-transparent p-0 shadow-none">
                    <div className="bg-base-100 rounded-box">
                        <div className="input w-full border-0 !outline-none">
                            <span className="iconify ri--search-line text-base-content/60 size-4.5" />
                            <input
                                type="search"
                                className="grow"
                                placeholder="Search docs, guides, or changelogs"
                                aria-label="Search"
                            />
                            <form method="dialog">
                                <button className="btn btn-xs btn-circle btn-ghost" aria-label="Close">
                                    <span className="iconify ri--close-line text-base-content/80 size-4.5" />
                                </button>
                            </form>
                        </div>
                    </div>

                    <div className="bg-base-100 rounded-box mt-4">
                        <div className="px-5 py-3">
                            <div className="mt-2 flex flex-wrap gap-2">
                                <select className="select select-sm w-28" defaultValue="-1">
                                    <option disabled value="-1">
                                        Sort
                                    </option>
                                    <option>Relevance</option>
                                    <option>Updated</option>
                                    <option>Title</option>
                                </select>
                                <select className="select select-sm w-28" defaultValue="-1">
                                    <option disabled value="-1">
                                        Category
                                    </option>
                                    <option>Getting Started</option>
                                    <option>API</option>
                                    <option>Troubleshooting</option>
                                </select>
                                <select className="select select-sm w-28" defaultValue="-1">
                                    <option disabled value="-1">
                                        Author
                                    </option>
                                    <option>Docs Team</option>
                                    <option>Engineering</option>
                                    <option>External</option>
                                </select>
                            </div>
                        </div>

                        <ul className="menu menu-sm w-full pt-0">
                            <li className="menu-title">Recent searches</li>
                            <li>
                                <div>
                                    <span className="iconify ri--time-line size-4 opacity-80" />
                                    <p className="text-sm">Authentication Setup</p>
                                    <span className="text-xs opacity-60">5 minutes ago</span>
                                </div>
                            </li>
                            <li>
                                <div>
                                    <span className="iconify ri--time-line size-4 opacity-80" />
                                    <p className="text-sm">API Rate Limits</p>
                                    <span className="text-xs opacity-60">Today, 11:02 AM</span>
                                </div>
                            </li>
                            <li>
                                <div>
                                    <span className="iconify ri--time-line size-4 opacity-80" />
                                    <p className="text-sm">Webhooks Guide</p>
                                    <span className="text-xs opacity-60">Yesterday</span>
                                </div>
                            </li>
                        </ul>

                        <hr className="border-base-300 h-px border-dashed" />

                        <ul className="menu w-full pt-1">
                            <li className="menu-title">Documentation</li>

                            <li>
                                <div>
                                    <span className="iconify ri--file-text-line size-4 opacity-80" />
                                    <p className="text-sm">Getting Started with SDK</p>
                                    <div className="badge badge-sm gap-1.5">
                                        <span className="iconify ri--stack-line size-3" />
                                        Setup
                                    </div>
                                </div>
                            </li>

                            <li>
                                <div>
                                    <span className="iconify ri--code-line size-4 opacity-80" />
                                    <p className="text-sm">REST API Reference</p>
                                    <div className="badge badge-sm gap-1.5">
                                        <span className="iconify ri--code-s-slash-line size-3" />
                                        API
                                    </div>
                                </div>
                            </li>

                            <li>
                                <div>
                                    <span className="iconify ri--error-warning-line size-4 opacity-80" />
                                    <p className="text-sm">Error Codes Explained</p>
                                    <div className="badge badge-sm gap-1.5">
                                        <span className="iconify ri--alert-line size-3" />
                                        Debug
                                    </div>
                                </div>
                            </li>

                            <li>
                                <div>
                                    <span className="iconify ri--refresh-line size-4 opacity-80" />
                                    <p className="text-sm">Migration to v3</p>
                                    <div className="badge badge-sm gap-1.5">
                                        <span className="iconify ri--refresh-line size-3" />
                                        Changelog
                                    </div>
                                </div>
                            </li>

                            <li>
                                <div>
                                    <span className="iconify ri--computer-line size-4 opacity-80" />
                                    <p className="text-sm">Analytics Integration</p>
                                    <div className="badge badge-sm gap-1.5">
                                        <span className="iconify ri--bar-chart-line size-3" />
                                        Guide
                                    </div>
                                </div>
                            </li>
                        </ul>

                        <div className="border-base-300 flex items-center gap-3 border-t p-3">
                            <div className="flex items-center gap-0.5">
                                <div className="border-base-300 bg-base-200 flex size-5 items-center justify-center rounded-sm border shadow-xs">
                                    <span className="iconify ri--arrow-up-line size-3.5" />
                                </div>
                                <div className="border-base-300 bg-base-200 flex size-5 items-center justify-center rounded-sm border shadow-xs">
                                    <span className="iconify ri--arrow-down-line size-3.5" />
                                </div>
                                <p className="text-base-content/80 ms-1 text-sm">Navigate</p>
                            </div>

                            <div className="flex items-center gap-0.5">
                                <div className="border-base-300 bg-base-200 flex size-5 items-center justify-center rounded-sm border shadow-xs">
                                    <span className="iconify ri--login-box-line size-3.5" />
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
