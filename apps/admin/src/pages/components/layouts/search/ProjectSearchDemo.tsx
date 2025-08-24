import React, { useRef } from "react";

export const ProjectSearchDemo = () => {
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
            <dialog id="search-modal-demo-4" ref={dialogRef} className="modal p-0">
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
                    <div className="mt-3 px-4">
                        <p className="text-base-content/70 text-sm font-medium">Customize View</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button className="btn btn-soft btn-sm">
                                <span className="iconify lucide--users size-3.5"></span>
                                Teams
                                <span className="iconify lucide--chevron-down size-3.5 opacity-60"></span>
                            </button>
                            <button className="btn btn-soft btn-sm">
                                <span className="iconify lucide--user-circle size-3.5"></span>
                                Owner
                                <span className="iconify lucide--chevron-down size-3.5 opacity-60"></span>
                            </button>
                            <button className="btn btn-soft btn-sm">
                                <span className="iconify lucide--calendar size-3.5"></span>
                                Date
                                <span className="iconify lucide--chevron-down size-3.5 opacity-60"></span>
                            </button>
                        </div>
                    </div>
                    <ul className="menu w-full space-y-0.5 pt-1">
                        <li className="menu-title pb-0">Members</li>

                        <li>
                            <div className="rounded-box hover:bg-base-200 flex cursor-pointer items-center gap-3 px-2 py-1 transition-all">
                                <div className="avatar avatar-online size-10">
                                    <img
                                        src="/images/avatars/1.png"
                                        className="from-primary/80 to-primary/60 mask mask-squircle bg-linear-to-b px-1 pt-1"
                                        alt="Olivia Carter"
                                    />
                                </div>
                                <div className="grow">
                                    <p className="leading-none font-medium">Olivia Carter</p>
                                    <div className="mt-1 flex items-center gap-2 text-sm/none opacity-70">
                                        <span>Editing project briefs and content</span>
                                    </div>
                                </div>
                                <span className="iconify lucide--chevron-right opacity-60"></span>
                            </div>
                        </li>

                        <li>
                            <div className="rounded-box hover:bg-base-200 flex cursor-pointer items-center gap-3 px-2 py-1 transition-all">
                                <div className="avatar avatar-offline size-10">
                                    <img
                                        src="/images/avatars/2.png"
                                        className="from-secondary/80 to-secondary/60 mask mask-squircle bg-linear-to-b px-1 pt-1"
                                        alt="Liam Mitchell"
                                    />
                                </div>
                                <div className="grow">
                                    <p className="leading-none font-medium">Liam Mitchell</p>
                                    <div className="mt-1 flex items-center gap-2 text-sm/none opacity-70">
                                        <span>Handling UI and visual designs</span>
                                    </div>
                                </div>
                                <span className="iconify lucide--chevron-right opacity-60"></span>
                            </div>
                        </li>

                        <li>
                            <div className="rounded-box hover:bg-base-200 flex cursor-pointer items-center gap-3 px-2 py-1 transition-all">
                                <div className="avatar avatar-online size-10">
                                    <img
                                        src="/images/avatars/3.png"
                                        className="from-success/80 to-success/60 mask mask-squircle bg-linear-to-b px-1 pt-1"
                                        alt="Emma Johnson"
                                    />
                                </div>
                                <div className="grow">
                                    <p className="leading-none font-medium">Emma Johnson</p>
                                    <div className="mt-1 flex items-center gap-2 text-sm/none opacity-70">
                                        <span>Building core project features</span>
                                    </div>
                                </div>
                                <span className="iconify lucide--chevron-right opacity-60"></span>
                            </div>
                        </li>
                    </ul>

                    <hr className="border-base-300 h-px border-dashed" />

                    <div className="mt-3">
                        <div className="px-4">
                            <p className="text-base-content/70 text-sm font-medium">Actions / Create</p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <button className="btn btn-outline btn-sm border-base-300">
                                    <span className="iconify lucide--users size-3.5"></span>
                                    Team
                                </button>
                                <button className="btn btn-outline btn-sm border-base-300">
                                    <span className="iconify lucide--user-plus size-3.5"></span>
                                    Member
                                </button>
                                <button className="btn btn-outline btn-sm border-base-300">
                                    <span className="iconify lucide--folder-plus size-3.5"></span>
                                    Project
                                </button>
                                <button className="btn btn-outline btn-sm border-base-300">
                                    <span className="iconify lucide--list-plus size-3.5"></span>
                                    Task
                                </button>
                                <button className="btn btn-outline btn-sm border-base-300">
                                    <span className="iconify lucide--calendar-plus size-3.5"></span>
                                    Event
                                </button>
                            </div>
                        </div>
                        <ul className="menu w-full px-2 pt-2">
                            <li>
                                <div>
                                    <span className="iconify lucide--user-round-check size-4.5" />
                                    <p className="grow text-sm">Assign Task</p>
                                    <div className="kbd kbd-sm text-base-content">A</div>
                                </div>
                            </li>
                            <li>
                                <div>
                                    <span className="iconify lucide--user-round-x size-4.5" />
                                    <p className="grow text-sm">Remove Assignment</p>
                                    <div className="kbd kbd-sm text-base-content">R</div>
                                </div>
                            </li>
                        </ul>
                    </div>
                    <div className="border-base-300 flex items-center gap-3 border-t px-4 py-3">
                        <div className="flex items-center gap-0.5">
                            <div className="border-base-300 bg-base-200 flex size-5 items-center justify-center rounded-sm border shadow-xs">
                                <span className="iconify lucide--arrow-up size-3.5"></span>
                            </div>
                            <div className="border-base-300 bg-base-200 flex size-5 items-center justify-center rounded-sm border shadow-xs">
                                <span className="iconify lucide--arrow-down size-3.5"></span>
                            </div>
                            <p className="text-base-content/80 ms-1 text-sm">Navigate</p>
                        </div>
                        <div className="flex items-center gap-0.5 max-sm:hidden">
                            <div className="border-base-300 bg-base-200 flex size-5 items-center justify-center rounded-sm border shadow-xs">
                                <span className="iconify lucide--undo-2 size-3.5"></span>
                            </div>
                            <p className="text-base-content/80 ms-1 text-sm">Return</p>
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
                <form method="dialog" className="modal-backdrop">
                    <button>close</button>
                </form>
            </dialog>
        </>
    );
};
