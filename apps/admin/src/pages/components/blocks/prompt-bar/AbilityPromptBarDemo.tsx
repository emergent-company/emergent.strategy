export const AbilityPromptBarDemo = () => {
    return (
        <div className="card bg-base-200/50 max-w-2xl grow p-1.5 pt-0">
            <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                <p className="text-base-content/80 text-sm">
                    Saved to <span className="cursor-pointer italic underline">Library</span>
                </p>
                <p className="text-base-content/60 text-xs font-medium">
                    <span className="text-error">58</span> Tokens left
                </p>
            </div>
            <div className="card-body bg-base-100 rounded-box p-3 shadow-xs">
                <textarea
                    className="textarea m-0 h-28 w-full resize-none border-0 p-1 text-base focus:outline-none"
                    placeholder="Type your request and choose an ability to enhance it"
                />
                <div className="mt-2 flex items-end justify-between">
                    <div className="flex items-center gap-0.5">
                        <div className="dropdown dropdown-start">
                            <div
                                tabIndex={0}
                                role="button"
                                className="btn btn-sm btn-ghost gap-2"
                                aria-label="Ability Selector">
                                <i className="iconify lucide--zap size-4"></i>
                                <p>Ability</p>
                                <i className="iconify lucide--chevron-down size-3.5"></i>
                            </div>
                            <ul
                                tabIndex={0}
                                className="dropdown-content bg-base-100 rounded-box menu mt-2 w-56 p-1.5 shadow">
                                <li>
                                    <div className="flex items-center gap-2.5">
                                        <i className="iconify lucide--eye size-4 opacity-80"></i>
                                        Vision
                                    </div>
                                </li>
                                <li>
                                    <div className="flex items-center gap-2.5">
                                        <i className="iconify lucide--globe size-4 opacity-80"></i>
                                        Browsing
                                    </div>
                                </li>
                                <li>
                                    <div className="flex items-center gap-2.5">
                                        <i className="iconify lucide--mic size-4 opacity-80"></i>
                                        Voice Input
                                    </div>
                                </li>
                                <li>
                                    <div className="flex items-center gap-2.5">
                                        <i className="iconify lucide--video size-4 opacity-80"></i>
                                        Video Understanding
                                    </div>
                                </li>
                                <li>
                                    <div className="flex items-center gap-2.5">
                                        <i className="iconify lucide--image size-4 opacity-80"></i>
                                        Image Generation
                                    </div>
                                </li>
                                <li>
                                    <div className="flex items-center gap-2.5">
                                        <i className="iconify lucide--file-text size-4 opacity-80"></i>
                                        Document Analysis
                                    </div>
                                </li>
                                <li>
                                    <div className="flex items-center gap-2.5">
                                        <i className="iconify lucide--code size-4 opacity-80"></i>
                                        Code Writing
                                    </div>
                                </li>
                            </ul>
                        </div>
                    </div>

                    <div className="flex items-center gap-1">
                        <button className="btn btn-sm btn-square btn-ghost" aria-label="Add Action">
                            <span className="iconify lucide--plus-circle text-base-content/60 size-4"></span>
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
