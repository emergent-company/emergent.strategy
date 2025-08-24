export const SocialFooterDemo = () => {
    return (
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
    );
};
