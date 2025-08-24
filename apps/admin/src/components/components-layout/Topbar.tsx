import { Link } from "react-router";

import { ThemeToggle } from "@/components/ThemeToggle";

export const Topbar = () => {
    return (
        <div
            role="navigation"
            aria-label="Navbar"
            className="border-base-300/80 bg-base-100 sticky top-0 z-1 h-16 border-b border-dashed px-4 md:px-8 xl:px-12 2xl:px-20">
            <div className="flex h-full items-center justify-between px-0">
                <div className="flex items-center gap-5">
                    <Link
                        to="/dashboards/ecommerce"
                        className="text-base-content/70 hover:text-base-content transition-all">
                        Dashboard
                    </Link>
                    <Link to="/components" className="font-medium">
                        Components
                    </Link>
                </div>
                <div className="inline-flex items-center gap-3">
                    <ThemeToggle className="btn btn-sm btn-square btn-ghost" />
                    <Link
                        to="https://daisyui.com/store/244268?aff=Db6q2"
                        target="_blank"
                        className="btn from-primary to-secondary group/purchase text-primary-content btn-sm max-sm:btn-square relative gap-2 border-0 bg-linear-to-r text-sm">
                        <span className="iconify lucide--shopping-cart size-4" />
                        <span className="max-sm:hidden">Buy Now</span>
                        <div className="from-primary to-secondary absolute inset-x-0 top-1 -z-1 h-8 bg-linear-to-r opacity-40 blur-md transition-all duration-500 group-hover/purchase:opacity-60 group-hover/purchase:blur-lg"></div>
                    </Link>
                </div>
            </div>
        </div>
    );
};
