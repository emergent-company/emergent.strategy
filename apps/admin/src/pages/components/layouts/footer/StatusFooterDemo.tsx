export const StatusFooterDemo = () => {
    return (
        <div className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="border-base-300 bg-base-100 hover:bg-base-200 flex cursor-pointer items-center gap-2.5 rounded-full border px-2.5 py-1 shadow-xs transition-all">
                <div className="status status-success"></div>
                <p className="text-base-content/80 text-sm">System running smoothly</p>
            </div>
            <span className="text-base-content/80 text-sm">
                © {new Date().getFullYear()} Nexus. All rights reserved
            </span>
        </div>
    );
};
