import { useRef } from "react";

export const SmartSearchDemo = () => {
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
            <dialog id="search-modal-demo-3" ref={dialogRef} className="modal p-0">
                <div className="modal-box p-0">
                    <div className="input border-base-300 w-full rounded-none border-0 border-b">
                        <span className="iconify lucide--search text-base-content/60 size-4.5" />
                        <input type="search" className="grow" placeholder="Search" aria-label="Search" />
                        <form method="dialog">
                            <button className="btn btn-xs btn-circle btn-ghost" aria-label="Close">
                                <span className="iconify lucide--x text-base-content/80 size-4" />
                            </button>
                        </form>
                    </div>
                    <ul className="menu w-full space-y-1.5 pt-1">
                        <li className="menu-title pb-0">Search Results</li>

                        <li>
                            <div className="flex items-start gap-3">
                                <div className="border-base-300 rounded-box flex items-center justify-center border p-1.5">
                                    <span className="iconify lucide--sparkles size-5" />
                                </div>
                                <div className="grow">
                                    <p className="leading-none font-medium">Generate Text</p>
                                    <p className="mt-1 text-sm/none opacity-80">
                                        Create content with natural language prompts.
                                    </p>
                                </div>
                            </div>
                        </li>

                        <li>
                            <div className="flex items-start gap-3">
                                <div className="border-base-300 rounded-box flex items-center justify-center border p-1.5">
                                    <span className="iconify lucide--image size-5" />
                                </div>
                                <div className="grow">
                                    <p className="leading-none font-medium">Create Image</p>
                                    <p className="mt-1 text-sm/none opacity-80">
                                        Turn your ideas into visual content instantly.
                                    </p>
                                </div>
                            </div>
                        </li>
                    </ul>

                    <hr className="border-base-300 h-px border-dashed" />

                    <ul className="menu w-full space-y-1.5 pt-1">
                        <li className="menu-title pb-0">Quick Links</li>

                        <li>
                            <div className="flex items-start gap-3">
                                <div className="border-base-300 rounded-box flex items-center justify-center border p-1.5">
                                    <span className="iconify lucide--bot size-5" />
                                </div>
                                <div className="grow">
                                    <p className="leading-none font-medium">Assistant</p>
                                    <p className="mt-1 text-sm/none opacity-80">
                                        Ask questions or get task suggestions fast.
                                    </p>
                                </div>
                            </div>
                        </li>

                        <li>
                            <div className="flex items-start gap-3">
                                <div className="border-base-300 rounded-box flex items-center justify-center border p-1.5">
                                    <span className="iconify lucide--clipboard-list size-5" />
                                </div>
                                <div className="grow">
                                    <p className="leading-none font-medium">My Tasks</p>
                                    <p className="mt-1 text-sm/none opacity-80">
                                        View and manage your recent work items.
                                    </p>
                                </div>
                            </div>
                        </li>

                        <li>
                            <div className="flex items-start gap-3">
                                <div className="border-base-300 rounded-box flex items-center justify-center border p-1.5">
                                    <span className="iconify lucide--bar-chart-3 size-5" />
                                </div>
                                <div className="grow">
                                    <p className="leading-none font-medium">Insights</p>
                                    <p className="mt-1 text-sm/none opacity-80">
                                        Review usage data, stats, and summaries.
                                    </p>
                                </div>
                            </div>
                        </li>

                        <li>
                            <div className="flex items-start gap-3">
                                <div className="border-base-300 rounded-box flex items-center justify-center border p-1.5">
                                    <span className="iconify lucide--settings size-5" />
                                </div>
                                <div className="grow">
                                    <p className="leading-none font-medium">Settings</p>
                                    <p className="mt-1 text-sm/none opacity-80">
                                        Update preferences, limits, and profile data.
                                    </p>
                                </div>
                            </div>
                        </li>
                    </ul>
                    <div className="mt-1 mb-3 flex items-center justify-center">
                        <button className="btn btn-soft btn-sm btn-primary">Expand results</button>
                    </div>
                </div>
                <form method="dialog" className="modal-backdrop">
                    <button>close</button>
                </form>
            </dialog>
        </>
    );
};
