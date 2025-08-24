export const MinimalPromptBarDemo = () => {
    return (
        <div className="card bg-base-100 card-border max-w-2xl grow">
            <div className="card-body p-3">
                <textarea
                    className="textarea m-0 h-28 w-full resize-none border-0 p-1 text-base focus:outline-none"
                    placeholder="Describe what you want to create or edit"
                />
                <div className="mt-2 flex items-end justify-between">
                    <div className="flex items-center gap-0.5">
                        <button className="btn btn-sm btn-square btn-ghost" aria-label="Add Action">
                            <span className="iconify lucide--plus text-base-content/60 size-4"></span>
                        </button>
                        <button className="btn btn-sm btn-square btn-ghost" aria-label="Insert Image">
                            <span className="iconify lucide--image-plus text-base-content/60 size-4"></span>
                        </button>
                    </div>
                    <span className="text-xs">
                        <span className="text-base-content/80">Tokens:</span>{" "}
                        <span className="text-error font-medium">88</span>{" "}
                        <span className="text-base-content/60">/100</span>
                    </span>
                    <div className="flex items-center gap-1">
                        <button className="btn btn-sm btn-square btn-ghost" aria-label="Voice Input">
                            <span className="iconify lucide--mic text-base-content/60 size-4"></span>
                        </button>
                        <button className="btn btn-primary btn-square btn-sm" aria-label="Send">
                            <span className="iconify lucide--arrow-up size-4"></span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
