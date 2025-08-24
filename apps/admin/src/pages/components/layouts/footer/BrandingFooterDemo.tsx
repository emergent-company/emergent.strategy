export const BrandingFooterDemo = () => {
    return (
        <div className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3">
            <span className="text-base-content/80 text-sm">
                © {new Date().getFullYear()} Nexus. All rights reserved
            </span>
            <span className="text-base-content/80 flex items-center gap-1 text-sm">
                Built with <span className="iconify lucide--heart text-red-600"></span> daisyUI
            </span>
        </div>
    );
};
