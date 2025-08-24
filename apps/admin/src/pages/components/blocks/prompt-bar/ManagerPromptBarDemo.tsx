export const ManagerPromptBarDemo = () => {
    return (
        <div className="card bg-base-200/50 card-border max-w-2xl grow">
            <div className="card-body bg-base-100 rounded-box p-3">
                <textarea
                    className="textarea m-0 h-20 w-full resize-none border-0 p-1 text-base focus:outline-none"
                    placeholder="Write your prompt or select one from My Prompts"
                />
                <div className="mt-2 flex items-end justify-between">
                    <div className="flex items-center gap-0.5">
                        <button className="btn btn-sm btn-square btn-ghost" aria-label="Quick Action">
                            <span className="iconify lucide--volume-2 text-base-content/60 size-4"></span>
                        </button>
                        <button className="btn btn-sm btn-square btn-ghost" aria-label="Quick Action">
                            <span className="iconify lucide--smile-plus text-base-content/60 size-4"></span>
                        </button>
                    </div>

                    <div className="flex items-center gap-1">
                        <button className="btn btn-sm btn-square btn-ghost" aria-label="Voice Input">
                            <span className="iconify lucide--mic text-base-content/60 size-4"></span>
                        </button>
                        <button className="btn btn-primary btn-square btn-sm" aria-label="Send Prompt">
                            <span className="iconify lucide--arrow-up size-4"></span>
                        </button>
                    </div>
                </div>
            </div>
            <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                <button className="btn btn-sm btn-ghost text-base-content/80" aria-label="My Prompts">
                    <span className="iconify lucide--book-text size-4"></span>
                    My Prompts
                    <span className="iconify lucide--chevron-down text-base-content/60 size-3.5"></span>
                </button>
                <div className="flex items-center gap-0.5">
                    <button className="btn btn-sm btn-square btn-ghost" aria-label="Quick Action">
                        <span className="iconify lucide--pin text-base-content/60 size-4"></span>
                    </button>
                    <button className="btn btn-sm btn-square btn-ghost" aria-label="Settings">
                        <span className="iconify lucide--save text-base-content/60 size-4"></span>
                    </button>
                    <button className="btn btn-sm btn-square btn-ghost" aria-label="Settings">
                        <span className="iconify lucide--settings-2 text-base-content/60 size-4"></span>
                    </button>
                </div>
            </div>
        </div>
    );
};
