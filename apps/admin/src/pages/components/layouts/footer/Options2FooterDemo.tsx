export const Options2FooterDemo = () => {
    return (
        <div className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3">
            <span className="text-base-content/80 text-sm">
                © {new Date().getFullYear()} Nexus. All rights reserved
            </span>
            <div className="flex items-center gap-2">
                <div className="dropdown dropdown-top">
                    <div tabIndex={0} role="button" className="btn btn-sm">
                        <span className="iconify lucide--globe size-4"></span>
                        English
                        <span className="iconify lucide--chevron-down text-base-content/60 size-4"></span>
                    </div>
                    <ul tabIndex={0} className="dropdown-content menu bg-base-100 rounded-box z-1 w-40 p-2 shadow-sm">
                        <li>
                            <a>English</a>
                        </li>
                        <li>
                            <a>Hindi</a>
                        </li>
                        <li>
                            <a>Spanish</a>
                        </li>
                        <li>
                            <a>Chinese</a>
                        </li>
                    </ul>
                </div>
                <div className="dropdown dropdown-top dropdown-end">
                    <div tabIndex={0} role="button" className="btn btn-sm">
                        <span className="iconify lucide--dollar-sign size-4"></span>
                        USD
                        <span className="iconify lucide--chevron-down text-base-content/60 size-4"></span>
                    </div>
                    <ul tabIndex={0} className="dropdown-content menu bg-base-100 rounded-box z-1 w-40 p-2 shadow-sm">
                        <li>
                            <a>$ (USD)</a>
                        </li>
                        <li>
                            <a>₹ (INR)</a>
                        </li>
                        <li>
                            <a>€ (Euro)</a>
                        </li>
                        <li>
                            <a>¥ (Yuan)</a>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    );
};
