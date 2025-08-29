export const Footer = () => {
    return (
        <div className="flex flex-wrap justify-between items-center gap-3 px-6 py-3 w-full">
            <div className="flex items-center gap-2.5 bg-base-100 hover:bg-base-200 shadow-xs px-2.5 py-1 border border-base-300 rounded-full transition-all cursor-pointer">
                <span className="status status-success"></span>
                <p className="text-sm text-base-content/80">System running smoothly</p>
            </div>
            <span className="text-sm text-base-content/80">
                © {new Date().getFullYear()} Nexus. All rights reserved
            </span>
        </div>
    );
};
