export const ModelPromptBarDemo = () => {
    return (
        <div className="card bg-primary/10 max-w-2xl grow">
            <div className="flex items-center gap-2 px-4 py-1.5">
                <span className="iconify lucide--info text-primary size-3.5"></span>
                <p className="text-primary grow text-xs">This tool lets you choose and prompt different models.</p>
                <button className="btn btn-xs btn-circle btn-ghost hover:bg-primary/20 border-0" aria-label="Close">
                    <span className="iconify lucide--x text-primary/60 size-4"></span>
                </button>
            </div>
            <div className="card-body bg-base-100 rounded-box border-primary/15 border border-t-0 p-3">
                <textarea
                    className="textarea m-0 h-28 w-full resize-none border-0 p-1 text-base focus:outline-none"
                    placeholder="Type your request and select a model to process it"
                />
                <div className="mt-2 flex items-end justify-between">
                    <div className="flex items-center">
                        <div className="dropdown dropdown-start">
                            <div
                                tabIndex={0}
                                role="button"
                                className="btn btn-sm btn-ghost gap-2"
                                aria-label="Model Selector">
                                <span className="iconify lucide--cpu size-4"></span>
                                <p>ChatGPT</p>
                                <span className="iconify lucide--chevron-down size-3.5"></span>
                            </div>
                            <ul
                                tabIndex={0}
                                className="dropdown-content bg-base-100 rounded-box menu mt-2 w-48 p-1.5 shadow">
                                <li>
                                    <div>ChatGPT</div>
                                </li>
                                <li>
                                    <div>Midjourney</div>
                                </li>
                                <li>
                                    <div>Claude</div>
                                </li>
                                <li>
                                    <div>Gemini</div>
                                </li>
                                <li>
                                    <div>Stable Diffusion</div>
                                </li>
                                <li>
                                    <div>Perplexity</div>
                                </li>
                                <li>
                                    <div>Copilot</div>
                                </li>
                            </ul>
                        </div>
                    </div>

                    <div className="flex items-center gap-1">
                        <button className="btn btn-sm btn-square btn-ghost" aria-label="Add Action">
                            <span className="iconify lucide--plus text-base-content/60 size-4"></span>
                        </button>
                        <button className="btn btn-sm btn-square btn-ghost" aria-label="Voice Input">
                            <span className="iconify lucide--mic text-base-content/60 size-4"></span>
                        </button>
                        <button className="btn btn-primary btn-sm gap-2" aria-label="Send Prompt">
                            <span className="iconify lucide--send size-3.5"></span>
                            Send
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
