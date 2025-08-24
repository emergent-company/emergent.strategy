export const InputToolbar = () => {
    return (
        <div className="card bg-base-100 card-border max-w-4xl grow">
            <div className="card-body p-3">
                <textarea
                    aria-label="Message"
                    className="textarea m-0 h-28 w-full resize-none border-0 p-1 text-base focus:outline-none max-sm:placeholder:text-sm"
                    defaultValue="Put this image in the Excel sheet and save this file to the project folder"
                />
                <div className="mt-0.5 flex items-center gap-2.5">
                    <div className="border-base-300 rounded-box hover:bg-base-200 flex cursor-pointer items-center gap-2 border px-2 py-0.5">
                        <span className="iconify lucide--file-spreadsheet size-3.5"></span>
                        <span className="text-sm">Report.xlsx</span>
                        <span className="iconify lucide--x size-3.5"></span>
                    </div>
                    <div className="border-base-300 rounded-box hover:bg-base-200 flex cursor-pointer items-center gap-2 border px-2 py-0.5 max-sm:hidden">
                        <span className="iconify lucide--file-image size-3.5"></span>
                        <span className="text-sm">DesignDraft.png</span>
                        <span className="iconify lucide--x size-3.5"></span>
                    </div>
                    <button className="btn btn-xs btn-circle btn-ghost" aria-label="Add">
                        <span className="iconify lucide--plus-circle text-base-content/80 size-4.5"></span>
                    </button>
                </div>
                <div className="mt-0.5 flex items-end justify-between">
                    <div className="inline-flex items-center gap-0.5">
                        <div className="dropdown dropdown-start">
                            <div
                                tabIndex={0}
                                role="button"
                                className="badge badge-sm cursor-pointer"
                                aria-label="Priority">
                                <div className="bg-primary size-1.5 rounded-full"></div>
                                <p>Queue</p>
                            </div>
                            <ul
                                tabIndex={0}
                                className="dropdown-content bg-base-100 rounded-box menu mt-2 w-36 p-1.5 shadow">
                                <li>
                                    <div>
                                        <div className="bg-error size-1.5 rounded-full"></div>
                                        Urgent
                                    </div>
                                </li>
                                <li>
                                    <div>
                                        <div className="bg-primary size-1.5 rounded-full"></div>
                                        Queue
                                    </div>
                                </li>
                                <li>
                                    <div>
                                        <div className="bg-base-content/30 size-1.5 rounded-full"></div>
                                        Background
                                    </div>
                                </li>
                            </ul>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button className="btn btn-sm btn-circle btn-ghost" aria-label="Voice">
                            <span className="iconify lucide--mic text-base-content/80 size-4.5"></span>
                        </button>
                        <button className="btn btn-primary btn-circle btn-sm" aria-label="Send">
                            <span className="iconify lucide--arrow-up size-4"></span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
