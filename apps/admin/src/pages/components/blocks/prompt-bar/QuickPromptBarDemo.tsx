export const QuickPromptBarDemo = () => {
    return (
        <div className="card bg-base-200/50 card-border max-w-2xl grow">
            <div className="card-body bg-base-100 rounded-box flex flex-row items-center gap-3 px-3 py-1.5">
                <button className="btn btn-sm btn-square btn-soft" aria-label="Quick Action">
                    <span className="iconify lucide--zap text-base-content/80 size-4"></span>
                </button>
                <input
                    className="input m-0 grow border-0 text-sm focus:outline-none"
                    placeholder="Type your message or prompt here"
                />
                <div className="flex items-center gap-1">
                    <button className="btn btn-sm btn-square btn-ghost" aria-label="Voice Input">
                        <span className="iconify lucide--mic text-base-content/60 size-4"></span>
                    </button>
                    <button className="btn btn-primary btn-square btn-sm" aria-label="Send Prompt">
                        <span className="iconify lucide--send-horizonal size-4"></span>
                    </button>
                </div>
            </div>
        </div>
    );
};
