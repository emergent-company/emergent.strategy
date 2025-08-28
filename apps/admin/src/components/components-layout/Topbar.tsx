import { Link } from "react-router";

import { ThemeToggle } from "@/components/ThemeToggle";

export const Topbar = () => {
    return (
        <div
            role="navigation"
            aria-label="Navbar"
            className="top-0 z-1 sticky bg-base-100 px-4 md:px-8 2xl:px-20 xl:px-12 border-b border-base-300/80 border-dashed h-16">
            <div className="flex justify-between items-center px-0 h-full">
                <div className="flex items-center gap-5">
                    <Link
                        to="/admin"
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
                        className="group/purchase relative gap-2 bg-linear-to-r from-primary to-secondary border-0 text-primary-content text-sm btn btn-sm max-sm:btn-square">
                        <span className="size-4 iconify lucide--shopping-cart" />
                        <span className="max-sm:hidden">Buy Now</span>
                        <div className="top-1 -z-1 absolute inset-x-0 bg-linear-to-r from-primary to-secondary opacity-40 group-hover/purchase:opacity-60 blur-md group-hover/purchase:blur-lg h-8 transition-all duration-500"></div>
                    </Link>
                </div>
            </div>
        </div>
    );
};
