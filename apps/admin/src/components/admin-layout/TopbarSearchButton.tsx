import { useRef } from "react";

export const TopbarSearchButton = () => {
    const dialogRef = useRef<HTMLDialogElement>(null);

    const showModal = () => {
        if (dialogRef.current) {
            dialogRef.current.showModal();
        }
    };

    return (
        <>
            <button
                className="btn btn-outline btn-sm btn-ghost border-base-300 text-base-content/70 hidden h-9 w-48 justify-start gap-2 !text-sm md:flex"
                onClick={showModal}>
                <span className="iconify lucide--search size-4" />
                <span>Search</span>
            </button>
            <button
                className="btn btn-outline btn-sm btn-square btn-ghost border-base-300 text-base-content/70 flex size-9 md:hidden"
                aria-label="Search"
                onClick={showModal}>
                <span className="iconify lucide--search size-4" />
            </button>
            <dialog ref={dialogRef} className="modal p-0">
                <div className="modal-box bg-transparent p-0 shadow-none">
                    <div className="bg-base-100 rounded-box">
                        <div className="input w-full border-0 !outline-none">
                            <span className="iconify lucide--search text-base-content/60 size-4.5" />
                            <input type="search" className="grow" placeholder="Search" aria-label="Search" />
                            <form method="dialog">
                                <button className="btn btn-xs btn-circle btn-ghost" aria-label="Close">
                                    <span className="iconify lucide--x text-base-content/80 size-4" />
                                </button>
                            </form>
                        </div>
                        <div className="border-base-300 flex items-center gap-3 border-t px-2 py-2">
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
                    <div className="bg-base-100 rounded-box mt-4">
                        <div className="px-5 py-3">
                            <p className="text-base-content/80 text-sm font-medium">I'm looking for...</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                <div className="border-base-300 hover:bg-base-200 rounded-box cursor-pointer border px-2.5 py-1 text-sm/none">
                                    Writer
                                </div>
                                <div className="border-base-300 hover:bg-base-200 rounded-box cursor-pointer border px-2.5 py-1 text-sm/none">
                                    Editor
                                </div>
                                <div className="border-base-300 hover:bg-base-200 rounded-box cursor-pointer border px-2.5 py-1 text-sm/none">
                                    Explainer
                                </div>
                                <div className="border-base-300 hover:bg-base-200 rounded-box flex cursor-pointer items-center gap-1 border border-dashed px-2.5 py-1 text-sm/none">
                                    <span className="iconify lucide--plus size-3.5"></span>
                                    Action
                                </div>
                            </div>
                        </div>
                        <hr className="border-base-300 h-px border-dashed" />

                        <ul className="menu w-full pt-1">
                            <li className="menu-title">Talk to assistant</li>
                            <li>
                                <div className="group">
                                    <div className="from-primary to-primary/80 mask mask-squircle text-primary-content flex size-5 items-center justify-center bg-linear-to-b leading-none font-medium">
                                        R
                                    </div>
                                    <p className="grow text-sm">Research Buddy</p>
                                    <div className="flex translate-x-2 items-center gap-2.5 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100">
                                        <span className="iconify lucide--star text-orange-500"></span>
                                        <div className="flex items-center gap-0.5">
                                            <div className="border-base-300 flex size-5 items-center justify-center rounded-sm border shadow-xs">
                                                <span className="iconify lucide--corner-down-left size-3.5"></span>
                                            </div>
                                            <p className="ms-1 text-sm opacity-80">Select</p>
                                        </div>
                                        <span className="iconify lucide--ellipsis-vertical opacity-80"></span>
                                    </div>
                                </div>
                            </li>

                            <li>
                                <div className="group">
                                    <div className="from-secondary to-secondary/80 mask mask-squircle text-secondary-content flex size-5 items-center justify-center bg-linear-to-b leading-none font-medium">
                                        T
                                    </div>
                                    <p className="grow text-sm">Task Planner</p>
                                    <div className="flex translate-x-2 items-center gap-2.5 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100">
                                        <span className="iconify lucide--star text-orange-500"></span>
                                        <div className="flex items-center gap-0.5">
                                            <div className="border-base-300 flex size-5 items-center justify-center rounded-sm border shadow-xs">
                                                <span className="iconify lucide--corner-down-left size-3.5"></span>
                                            </div>
                                            <p className="ms-1 text-sm opacity-80">Select</p>
                                        </div>
                                        <span className="iconify lucide--ellipsis-vertical opacity-80"></span>
                                    </div>
                                </div>
                            </li>
                            <li>
                                <div className="group">
                                    <div className="from-success to-success/80 mask mask-squircle text-success-content flex size-5 items-center justify-center bg-linear-to-b leading-none font-medium">
                                        S
                                    </div>
                                    <p className="grow text-sm">Sparking Ideas</p>
                                    <div className="flex translate-x-2 items-center gap-2.5 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100">
                                        <span className="iconify lucide--star text-orange-500"></span>
                                        <div className="flex items-center gap-0.5">
                                            <div className="border-base-300 flex size-5 items-center justify-center rounded-sm border shadow-xs">
                                                <span className="iconify lucide--corner-down-left size-3.5"></span>
                                            </div>
                                            <p className="ms-1 text-sm opacity-80">Select</p>
                                        </div>
                                        <span className="iconify lucide--ellipsis-vertical opacity-80"></span>
                                    </div>
                                </div>
                            </li>
                            <li>
                                <div className="group">
                                    <div className="from-warning to-warning/80 mask mask-squircle text-warning-content flex size-5 items-center justify-center bg-linear-to-b leading-none font-medium">
                                        D
                                    </div>
                                    <p className="grow text-sm">Docs Assistant</p>
                                    <div className="flex translate-x-2 items-center gap-2.5 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100">
                                        <span className="iconify lucide--star text-orange-500"></span>
                                        <div className="flex items-center gap-0.5">
                                            <div className="border-base-300 flex size-5 items-center justify-center rounded-sm border shadow-xs">
                                                <span className="iconify lucide--corner-down-left size-3.5"></span>
                                            </div>
                                            <p className="ms-1 text-sm opacity-80">Select</p>
                                        </div>
                                        <span className="iconify lucide--ellipsis-vertical opacity-80"></span>
                                    </div>
                                </div>
                            </li>
                        </ul>

                        <hr className="border-base-300 h-px border-dashed" />

                        <ul className="menu w-full pt-1">
                            <li className="menu-title flex flex-row items-center justify-between gap-2">
                                <span>Tasks Manager</span>
                                <span>Progress</span>
                            </li>
                            <li>
                                <div>
                                    <span className="iconify lucide--notebook size-4" />
                                    <p className="grow text-sm">Creating an essay</p>
                                    <progress
                                        className="progress progress-primary h-1 w-30"
                                        value="60"
                                        max="100"></progress>
                                </div>
                            </li>
                            <li>
                                <div>
                                    <span className="iconify lucide--message-circle size-4" />
                                    <p className="grow text-sm">Summarizing chat</p>
                                    <progress
                                        className="progress progress-secondary h-1 w-30"
                                        value="80"
                                        max="100"></progress>
                                </div>
                            </li>
                            <li>
                                <div>
                                    <span className="iconify lucide--code size-4" />
                                    <p className="grow text-sm">Fixing syntax</p>
                                    <progress
                                        className="progress progress-accent h-1 w-30"
                                        value="35"
                                        max="100"></progress>
                                </div>
                            </li>
                            <li>
                                <div>
                                    <span className="iconify lucide--book-open size-4" />
                                    <p className="grow text-sm">Reading docs</p>
                                    <progress
                                        className="progress progress-info h-1 w-30"
                                        value="90"
                                        max="100"></progress>
                                </div>
                            </li>
                            <li>
                                <div>
                                    <span className="iconify lucide--lightbulb size-4" />
                                    <p className="grow text-sm">Generating ideas</p>
                                    <progress
                                        className="progress progress-warning h-1 w-30"
                                        value="50"
                                        max="100"></progress>
                                </div>
                            </li>
                        </ul>
                    </div>
                </div>
                <form method="dialog" className="modal-backdrop">
                    <button>close</button>
                </form>
            </dialog>
        </>
    );
};
