import { Icon } from "@/components/ui/Icon";

export const BrandingFooterDemo = () => {
    return (
        <div className="flex flex-wrap justify-between items-center gap-3 px-4 py-3 w-full">
            <span className="text-sm text-base-content/80">
                © {new Date().getFullYear()} Nexus. All rights reserved
            </span>
            <span className="flex items-center gap-1 text-sm text-base-content/80">
                Built with <Icon icon="lucide--heart" className="text-red-600" /> daisyUI
            </span>
        </div>
    );
};
