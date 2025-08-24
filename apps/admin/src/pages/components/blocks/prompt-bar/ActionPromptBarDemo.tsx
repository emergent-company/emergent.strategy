export const ActionPromptBarDemo = () => {
    return (
        <div className="card bg-base-100 card-border max-w-2xl grow">
            <div className="card-body p-3">
                <textarea
                    className="textarea m-0 h-28 w-full resize-none border-0 p-1 text-base focus:outline-none"
                    placeholder="Type your request or attach files to get started"
                />
                <div className="mt-2 flex items-end justify-between">
                    <div className="flex items-center gap-2">
                        <button className="btn btn-sm btn-outline border-base-300 text-base-content/80">
                            <span className="iconify lucide--plus-circle size-4"></span>
                            Add File
                        </button>
                        <button className="btn btn-sm btn-outline border-base-300 text-base-content/80">
                            <span className="iconify lucide--brain size-4"></span>
                            Deep Thinking
                        </button>
                        <button className="btn btn-sm btn-outline border-base-300 text-base-content/80">
                            <span className="iconify lucide--globe size-4"></span>
                            Browsing
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
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
