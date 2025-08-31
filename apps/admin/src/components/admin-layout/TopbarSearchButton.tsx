import { useRef } from "react";
import { Icon } from "@/components/ui/Icon";

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
                className="hidden md:flex justify-start gap-2 border-base-300 btn-outline w-48 h-9 !text-sm text-base-content/70 btn btn-sm btn-ghost"
                onClick={showModal}>
                <Icon icon="lucide--search" className="size-4" />
                <span>Search</span>
            </button>
            <button
                className="md:hidden flex border-base-300 btn-outline size-9 text-base-content/70 btn btn-sm btn-square btn-ghost"
                aria-label="Search"
                onClick={showModal}>
                <Icon icon="lucide--search" className="size-4" />
            </button>
            <dialog ref={dialogRef} className="p-0 modal">
                <div className="bg-transparent shadow-none p-0 modal-box">
                    <div className="bg-base-100 rounded-box">
                        <div className="border-0 !outline-none w-full input">
                            <Icon icon="lucide--search" className="size-4.5 text-base-content/60" />
                            <input type="search" className="grow" placeholder="Search" aria-label="Search" />
                            <form method="dialog">
                                <button className="btn btn-xs btn-circle btn-ghost" aria-label="Close">
                                    <Icon icon="lucide--x" className="size-4 text-base-content/80" />
                                </button>
                            </form>
                        </div>
                        <div className="flex items-center gap-3 px-2 py-2 border-t border-base-300">
                            <div className="flex items-center gap-0.5">
                                <div className="flex justify-center items-center bg-base-200 shadow-xs border border-base-300 rounded-sm size-5">
                                    <Icon icon="lucide--arrow-up" className="size-3.5" />
                                </div>
                                <div className="flex justify-center items-center bg-base-200 shadow-xs border border-base-300 rounded-sm size-5">
                                    <Icon icon="lucide--arrow-down" className="size-3.5" />
                                </div>
                                <p className="ms-1 text-sm text-base-content/80">Navigate</p>
                            </div>
                            <div className="max-sm:hidden flex items-center gap-0.5">
                                <div className="flex justify-center items-center bg-base-200 shadow-xs border border-base-300 rounded-sm size-5">
                                    <Icon icon="lucide--undo-2" className="size-3.5" />
                                </div>
                                <p className="ms-1 text-sm text-base-content/80">Return</p>
                            </div>
                            <div className="flex items-center gap-0.5">
                                <div className="flex justify-center items-center bg-base-200 shadow-xs border border-base-300 rounded-sm size-5">
                                    <Icon icon="lucide--corner-down-left" className="size-3.5" />
                                </div>
                                <p className="ms-1 text-sm text-base-content/80">Open</p>
                            </div>
                            <div className="flex items-center gap-0.5 ms-auto">
                                <div className="flex justify-center items-center bg-base-200 shadow-xs px-1 border border-base-300 rounded-sm h-5 text-sm/none">
                                    esc
                                </div>
                                <p className="ms-1 text-sm text-base-content/80">Close</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-base-100 mt-4 rounded-box">
                        <div className="px-5 py-3">
                            <p className="font-medium text-sm text-base-content/80">I'm looking for...</p>
                            <div className="flex flex-wrap gap-1.5 mt-2">
                                <div className="hover:bg-base-200 px-2.5 py-1 border border-base-300 rounded-box text-sm/none cursor-pointer">
                                    Writer
                                </div>
                                <div className="hover:bg-base-200 px-2.5 py-1 border border-base-300 rounded-box text-sm/none cursor-pointer">
                                    Editor
                                </div>
                                <div className="hover:bg-base-200 px-2.5 py-1 border border-base-300 rounded-box text-sm/none cursor-pointer">
                                    Explainer
                                </div>
                                <div className="flex items-center gap-1 hover:bg-base-200 px-2.5 py-1 border border-base-300 border-dashed rounded-box text-sm/none cursor-pointer">
                                    <Icon icon="lucide--plus" className="size-3.5" />
                                    Action
                                </div>
                            </div>
                        </div>
                        <hr className="border-base-300 border-dashed h-px" />

                        <ul className="pt-1 w-full menu">
                            <li className="menu-title">Talk to assistant</li>
                            <li>
                                <div className="group">
                                    <div className="flex justify-center items-center bg-linear-to-b from-primary to-primary/80 size-5 font-medium text-primary-content leading-none mask mask-squircle">
                                        R
                                    </div>
                                    <p className="text-sm grow">Research Buddy</p>
                                    <div className="flex items-center gap-2.5 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0 duration-300">
                                        <Icon icon="lucide--star" className="text-orange-500" />
                                        <div className="flex items-center gap-0.5">
                                            <div className="flex justify-center items-center shadow-xs border border-base-300 rounded-sm size-5">
                                                <Icon icon="lucide--corner-down-left" className="size-3.5" />
                                            </div>
                                            <p className="opacity-80 ms-1 text-sm">Select</p>
                                        </div>
                                        <Icon icon="lucide--ellipsis-vertical" className="opacity-80" />
                                    </div>
                                </div>
                            </li>

                            <li>
                                <div className="group">
                                    <div className="flex justify-center items-center bg-linear-to-b from-secondary to-secondary/80 size-5 font-medium text-secondary-content leading-none mask mask-squircle">
                                        T
                                    </div>
                                    <p className="text-sm grow">Task Planner</p>
                                    <div className="flex items-center gap-2.5 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0 duration-300">
                                        <Icon icon="lucide--star" className="text-orange-500" />
                                        <div className="flex items-center gap-0.5">
                                            <div className="flex justify-center items-center shadow-xs border border-base-300 rounded-sm size-5">
                                                <Icon icon="lucide--corner-down-left" className="size-3.5" />
                                            </div>
                                            <p className="opacity-80 ms-1 text-sm">Select</p>
                                        </div>
                                        <Icon icon="lucide--ellipsis-vertical" className="opacity-80" />
                                    </div>
                                </div>
                            </li>
                            <li>
                                <div className="group">
                                    <div className="flex justify-center items-center bg-linear-to-b from-success to-success/80 size-5 font-medium text-success-content leading-none mask mask-squircle">
                                        S
                                    </div>
                                    <p className="text-sm grow">Sparking Ideas</p>
                                    <div className="flex items-center gap-2.5 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0 duration-300">
                                        <Icon icon="lucide--star" className="text-orange-500" />
                                        <div className="flex items-center gap-0.5">
                                            <div className="flex justify-center items-center shadow-xs border border-base-300 rounded-sm size-5">
                                                <Icon icon="lucide--corner-down-left" className="size-3.5" />
                                            </div>
                                            <p className="opacity-80 ms-1 text-sm">Select</p>
                                        </div>
                                        <Icon icon="lucide--ellipsis-vertical" className="opacity-80" />
                                    </div>
                                </div>
                            </li>
                            <li>
                                <div className="group">
                                    <div className="flex justify-center items-center bg-linear-to-b from-warning to-warning/80 size-5 font-medium text-warning-content leading-none mask mask-squircle">
                                        D
                                    </div>
                                    <p className="text-sm grow">Docs Assistant</p>
                                    <div className="flex items-center gap-2.5 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0 duration-300">
                                        <Icon icon="lucide--star" className="text-orange-500" />
                                        <div className="flex items-center gap-0.5">
                                            <div className="flex justify-center items-center shadow-xs border border-base-300 rounded-sm size-5">
                                                <Icon icon="lucide--corner-down-left" className="size-3.5" />
                                            </div>
                                            <p className="opacity-80 ms-1 text-sm">Select</p>
                                        </div>
                                        <Icon icon="lucide--ellipsis-vertical" className="opacity-80" />
                                    </div>
                                </div>
                            </li>
                        </ul>

                        <hr className="border-base-300 border-dashed h-px" />

                        <ul className="pt-1 w-full menu">
                            <li className="flex flex-row justify-between items-center gap-2 menu-title">
                                <span>Tasks Manager</span>
                                <span>Progress</span>
                            </li>
                            <li>
                                <div>
                                    <Icon icon="lucide--notebook" className="size-4" />
                                    <p className="text-sm grow">Creating an essay</p>
                                    <progress
                                        className="w-30 h-1 progress progress-primary"
                                        value="60"
                                        max="100"></progress>
                                </div>
                            </li>
                            <li>
                                <div>
                                    <Icon icon="lucide--message-circle" className="size-4" />
                                    <p className="text-sm grow">Summarizing chat</p>
                                    <progress
                                        className="w-30 h-1 progress progress-secondary"
                                        value="80"
                                        max="100"></progress>
                                </div>
                            </li>
                            <li>
                                <div>
                                    <Icon icon="lucide--code" className="size-4" />
                                    <p className="text-sm grow">Fixing syntax</p>
                                    <progress
                                        className="w-30 h-1 progress progress-accent"
                                        value="35"
                                        max="100"></progress>
                                </div>
                            </li>
                            <li>
                                <div>
                                    <Icon icon="lucide--book-open" className="size-4" />
                                    <p className="text-sm grow">Reading docs</p>
                                    <progress
                                        className="w-30 h-1 progress progress-info"
                                        value="90"
                                        max="100"></progress>
                                </div>
                            </li>
                            <li>
                                <div>
                                    <Icon icon="lucide--lightbulb" className="size-4" />
                                    <p className="text-sm grow">Generating ideas</p>
                                    <progress
                                        className="w-30 h-1 progress progress-warning"
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
