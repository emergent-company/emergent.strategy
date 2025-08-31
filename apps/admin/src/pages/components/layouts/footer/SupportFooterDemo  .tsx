import { Icon } from "@/components/ui/Icon";

export const SupportFooterDemo = () => {
    return (
        <div className="flex flex-wrap justify-between items-center gap-3 px-4 py-3 w-full">
            <div className="flex items-center gap-2">
                <button className="btn btn-soft btn-primary btn-sm btn-circle" aria-label="Call">
                    <Icon icon="lucide--headset" className="size-4.5" ariaLabel="Call" />
                </button>
                <span className="font-medium text-lg">800-124-546</span>
            </div>
            <div className="flex items-center">
                <p className="me-2 font-medium text-xs text-base-content/70 uppercase tracking-tight">Follow</p>
                <button className="btn btn-ghost btn-sm btn-circle" aria-label="Github">
                    <Icon icon="hugeicons--github" className="size-4.5" ariaLabel="Github" />
                </button>
                <button className="btn btn-ghost btn-sm btn-circle" aria-label="Twitter">
                    <Icon icon="hugeicons--new-twitter" className="size-4.5" ariaLabel="Twitter" />
                </button>
                <button className="btn btn-ghost btn-sm btn-circle" aria-label="Linkedin">
                    <Icon icon="hugeicons--linkedin-02" className="size-4.5" ariaLabel="LinkedIn" />
                </button>
            </div>
        </div>
    );
};
