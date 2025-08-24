export const Options1FooterDemo = () => {
    return (
        <div className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3">
            <span className="text-base-content/80 text-sm">
                © {new Date().getFullYear()} Nexus. All rights reserved
            </span>
            <div className="flex items-center gap-2 text-sm">
                <span>English</span>
                <div className="bg-base-content/15 size-1 rounded-full"></div>
                <span className="text-base-content/60 hover:text-base-content cursor-pointer transition-all">
                    Spanish
                </span>
                <div className="bg-base-content/15 size-1 rounded-full"></div>
                <span className="text-base-content/60 hover:text-base-content cursor-pointer transition-all">
                    Chinese
                </span>
            </div>
        </div>
    );
};
