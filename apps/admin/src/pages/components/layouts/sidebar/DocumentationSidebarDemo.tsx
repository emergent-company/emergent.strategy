import { Link } from "react-router";

export const DocumentationSidebarDemo = () => {
    return (
        <div className="sidebar-menu relative flex h-full w-full flex-col py-3">
            <label
                htmlFor="layout-sidebar-hover-trigger"
                title="Toggle sidebar hover"
                className="btn btn-circle btn-ghost btn-sm text-base-content/50 absolute end-2 top-3.5 max-lg:hidden">
                <span className="iconify lucide--panel-left-close absolute size-4.5 opacity-100 transition-all duration-300 group-has-[[id=layout-sidebar-hover-trigger]:checked]/html:opacity-0" />
                <span className="iconify lucide--panel-left-dashed absolute size-4.5 opacity-0 transition-all duration-300 group-has-[[id=layout-sidebar-hover-trigger]:checked]/html:opacity-100" />
            </label>
            <div className="flex min-h-10 items-center gap-3 px-5">
                <span className="text-xl font-semibold">ACME Inc</span>
                <hr className="border-base-300 h-5 border-e" />
                <span className="text-base-content/50 font-medium">Learn</span>
            </div>
            <div className="mt-2 px-5">
                <label className="input h-9 px-2.5">
                    <span className="iconify lucide--search text-base-content/80 min-h-4 min-w-4"></span>
                    <input className="grow" placeholder="Search" type="search" />
                    <kbd className="kbd kbd-sm">K</kbd>
                </label>
            </div>

            <div className="custom-scrollbar grow overflow-auto">
                <div className="mt-4 space-y-1.5 px-5">
                    <Link to="#" className="group flex items-center gap-2">
                        <div className="border-base-300 group-hover:bg-primary group-hover:border-primary rounded-box border p-1.5 transition-all">
                            <span className="iconify lucide--rocket group-hover:text-primary-content block size-4 transition-all"></span>
                        </div>
                        <span className="text-base-content/80 group-hover:text-base-content font-medium transition-all">
                            Getting Started
                        </span>
                    </Link>
                    <Link to="#" className="group flex items-center gap-2">
                        <div className="border-base-300 group-hover:bg-primary group-hover:border-primary rounded-box border p-1.5 transition-all">
                            <span className="iconify lucide--book-open group-hover:text-primary-content block size-4 transition-all"></span>
                        </div>
                        <span className="text-base-content/80 group-hover:text-base-content font-medium transition-all">
                            Guide
                        </span>
                    </Link>
                    <Link to="#" className="group flex items-center gap-2">
                        <div className="border-base-300 group-hover:bg-primary group-hover:border-primary rounded-box border p-1.5 transition-all">
                            <span className="iconify lucide--code-2 group-hover:text-primary-content block size-4 transition-all"></span>
                        </div>
                        <span className="text-base-content/80 group-hover:text-base-content font-medium transition-all">
                            API
                        </span>
                    </Link>
                    <Link to="#" className="group flex items-center gap-2">
                        <div className="border-base-300 group-hover:bg-primary group-hover:border-primary rounded-box border p-1.5 transition-all">
                            <span className="iconify lucide--users group-hover:text-primary-content block size-4 transition-all"></span>
                        </div>
                        <span className="text-base-content/80 group-hover:text-base-content font-medium transition-all">
                            Community
                        </span>
                    </Link>
                </div>
                <div className="border-base-300 mt-4 space-y-5 border-t border-dashed px-5 pt-4">
                    <div className="space-y-2.5">
                        <p className="menu-label">Getting Started</p>
                        <div className="space-y-2">
                            <Link
                                to="#"
                                className="text-base-content/90 hover:text-primary flex items-center gap-2 text-sm transition-all">
                                <span className="iconify lucide--play size-4"></span>
                                <span>Installation</span>
                            </Link>
                            <Link
                                to="#"
                                className="text-base-content/90 hover:text-primary flex items-center gap-2 text-sm transition-all">
                                <span className="iconify lucide--book-open size-4"></span>
                                <span>Quickstart</span>
                            </Link>
                            <Link
                                to="#"
                                className="text-base-content/90 hover:text-primary flex items-center gap-2 text-sm transition-all">
                                <span className="iconify lucide--file-text size-4"></span>
                                <span>Introduction</span>
                            </Link>
                            <Link
                                to="#"
                                className="text-base-content/90 hover:text-primary flex items-center gap-2 text-sm transition-all">
                                <span className="iconify lucide--settings size-4"></span>
                                <span>Configuration</span>
                            </Link>
                        </div>
                    </div>

                    <div className="space-y-2.5">
                        <p className="menu-label">Components</p>
                        <div className="space-y-2">
                            <Link
                                to="#"
                                className="text-base-content/90 hover:text-primary flex items-center gap-2 text-sm transition-all">
                                <span className="iconify lucide--layout size-4"></span>
                                <span>Layout</span>
                            </Link>
                            <Link
                                to="#"
                                className="text-base-content/90 hover:text-primary flex items-center gap-2 text-sm transition-all">
                                <span className="iconify lucide--form-input size-4"></span>
                                <span>Forms</span>
                            </Link>
                            <Link
                                to="#"
                                className="text-base-content/90 hover:text-primary flex items-center gap-2 text-sm transition-all">
                                <span className="iconify lucide--list size-4"></span>
                                <span>Lists</span>
                            </Link>
                        </div>
                    </div>
                    <div className="space-y-2.5">
                        <p className="menu-label">Utilities</p>
                        <div className="space-y-2">
                            <Link
                                to="#"
                                className="text-base-content/90 hover:text-primary flex items-center gap-2 text-sm transition-all">
                                <span className="iconify lucide--wand size-4"></span>
                                <span>Animation</span>
                            </Link>
                            <Link
                                to="#"
                                className="text-base-content/90 hover:text-primary flex items-center gap-2 text-sm transition-all">
                                <span className="iconify lucide--sun-moon size-4"></span>
                                <span>Theming</span>
                            </Link>
                            <Link
                                to="#"
                                className="text-base-content/90 hover:text-primary flex items-center gap-2 text-sm transition-all">
                                <span className="iconify lucide--zoom-in size-4"></span>
                                <span>Responsiveness</span>
                            </Link>
                            <Link
                                to="#"
                                className="text-base-content/90 hover:text-primary flex items-center gap-2 text-sm transition-all">
                                <span className="iconify lucide--code size-4"></span>
                                <span>Custom CSS</span>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
            <div className="mt-8 flex justify-between px-5">
                <p className="text-base-content/70 text-sm">Switch version</p>
                <div className="dropdown dropdown-top dropdown-center">
                    <div tabIndex={0} className="flex cursor-pointer items-center gap-1.5 text-sm hover:underline">
                        v2.1
                        <span className="iconify lucide--chevron-down size-3"></span>
                    </div>
                    <div tabIndex={0} className="dropdown-content bg-base-100 rounded-box mt-4 w-44 shadow">
                        <ul className="menu w-full p-2">
                            <li>
                                <p>
                                    <span className="font-semibold">v2.1</span> (Vanilla)
                                </p>
                            </li>
                            <li>
                                <p>
                                    <span className="font-semibold">v2.0</span> (Tailwind)
                                </p>
                            </li>
                        </ul>
                        <hr className="border-base-300" />
                        <p className="text-base-content/60 mt-2 px-4 text-sm font-medium">Legacy</p>
                        <ul className="menu w-full p-2">
                            <li>
                                <p>
                                    <span className="font-semibold">v1.4</span> (Classic)
                                </p>
                            </li>
                            <li>
                                <p className="text-error hover:bg-error/10">
                                    <span className="font-semibold">v0.8</span> (Discontinue)
                                </p>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>

            <div className="border-base-300 mt-3 space-y-1.5 border-t border-dashed px-5 pt-4">
                <Link
                    to="#"
                    className="text-base-content/90 hover:text-primary flex items-center gap-2 text-sm transition-all">
                    <span className="iconify lucide--pencil"></span>
                    <span>Edit this page</span>
                </Link>
                <Link
                    to="#"
                    className="text-base-content/90 hover:text-primary flex items-center gap-2 text-sm transition-all">
                    <span className="iconify lucide--star"></span>
                    <span>Star on Github</span>
                </Link>
            </div>
        </div>
    );
};
