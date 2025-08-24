export const SupportFooterDemo = () => {
    return (
        <div className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-2">
                <button className="btn btn-soft btn-primary btn-sm btn-circle" aria-label="Call">
                    <span className="iconify lucide--headset size-4.5" />
                </button>
                <span className="text-lg font-medium">800-124-546</span>
            </div>
            <div className="flex items-center">
                <p className="text-base-content/70 me-2 text-xs font-medium tracking-tight uppercase">Follow</p>
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
