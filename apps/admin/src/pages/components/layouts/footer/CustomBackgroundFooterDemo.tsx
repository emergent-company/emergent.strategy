export const CustomBackgroundFooterDemo = () => {
    return (
        <div className="bg-base-100 relative w-full overflow-hidden">
            <div className="absolute -start-16 top-4 z-1 h-8 w-1/2 bg-blue-500/60 blur-[160px]"></div>
            <div className="absolute -end-16 top-4 h-8 w-1/2 rounded-full bg-purple-500/60 blur-[160px]"></div>
            <div className="flex w-full items-center justify-between px-4 py-3">
                <span className="text-lg font-medium">Nexus</span>
                <span className="text-base-content/80 text-sm max-sm:hidden">
                    ©{new Date().getFullYear()}. All rights reserved.
                </span>
                <div className="flex items-center">
                    <button className="btn btn-ghost btn-sm btn-circle" aria-label="Github">
                        <span className="iconify hugeicons--github size-4.5" />
                    </button>
                    <button className="btn btn-ghost btn-sm btn-circle" aria-label="Twitter">
                        <span className="iconify hugeicons--new-twitter size-4.5" />
                    </button>
                    <button className="btn btn-ghost btn-sm btn-circle" aria-label="Linkedin">
                        <span className="iconify hugeicons--linkedin-02 size-4.5" />
                    </button>
                </div>
            </div>
        </div>
    );
};
