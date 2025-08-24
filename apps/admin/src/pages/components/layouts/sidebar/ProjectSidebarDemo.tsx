import { Link } from "react-router";

export const ProjectSidebarDemo = () => {
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
                <div className="flex items-center gap-1.5">
                    <div className="status status-success size-1.5"></div>
                    <span className="text-base-content/80 text-sm">Online</span>
                </div>
            </div>
            <div className="mt-2 px-5">
                <div className="dropdown dropdown-bottom dropdown-end w-full">
                    <div
                        tabIndex={0}
                        className="border-base-300 hover:bg-base-200 rounded-box flex cursor-pointer items-center gap-2 border p-1 pe-2">
                        <div className="bg-primary/20 rounded-box flex size-8 items-center justify-center">
                            <div className="mask mask-hexagon-2 bg-primary size-5"></div>
                        </div>
                        <div className="grow">
                            <p className="text-sm/none font-medium">Design System</p>
                            <p className="text-base-content/60 mt-1 text-xs/none">In Development</p>
                        </div>
                        <span className="iconify lucide--chevrons-up-down text-base-content/50"></span>
                    </div>
                    <div
                        tabIndex={0}
                        className="dropdown-content bg-base-100 rounded-box mt-1 w-44 shadow-md transition-all hover:shadow-lg">
                        <ul className="menu w-full space-y-1 p-2">
                            <li>
                                <div className="hover:bg-base-200 rounded-box flex cursor-pointer items-center gap-2 p-1 pe-2">
                                    <div className="bg-secondary/20 rounded-box flex size-8 items-center justify-center">
                                        <div className="mask mask-star-2 bg-secondary size-5"></div>
                                    </div>
                                    <div className="grow">
                                        <p className="text-sm/none font-medium">Project Astra</p>
                                        <p className="mt-1 text-xs/none opacity-60">In Production</p>
                                    </div>
                                </div>
                            </li>
                            <li>
                                <div className="hover:bg-base-200 rounded-box flex cursor-pointer items-center gap-2 p-1 pe-2">
                                    <div className="bg-warning/20 rounded-box flex size-8 items-center justify-center">
                                        <div className="mask mask-diamond bg-warning size-5"></div>
                                    </div>
                                    <div className="grow">
                                        <p className="text-sm/none font-medium">Web Analytics</p>
                                        <p className="mt-1 text-xs/none opacity-60">On Hold</p>
                                    </div>
                                </div>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>

            <div className="custom-scrollbar grow overflow-auto">
                <div className="mt-4">
                    <div className="flex items-center justify-between px-5">
                        <p className="menu-label">Navigation</p>
                        <button className="btn btn-xs btn-ghost btn-circle" aria-label="Add">
                            <span className="iconify lucide--plus size-4 opacity-60"></span>
                        </button>
                    </div>
                    <div className="mt-1 space-y-0.5 px-2.5">
                        <Link to="#" className="menu-item group">
                            <span className="iconify lucide--layout-dashboard size-4"></span>
                            <p className="grow">Dashboard</p>
                            <span className="iconify lucide--chevron-right size-3.5 -translate-x-1 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-60"></span>
                        </Link>
                        <Link to="#" className="menu-item group">
                            <span className="iconify lucide--folder-open size-4"></span>
                            <p className="grow">Projects</p>
                            <span className="iconify lucide--chevron-right size-3.5 -translate-x-1 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-60"></span>
                        </Link>
                        <Link to="#" className="menu-item group">
                            <span className="iconify lucide--users size-4"></span>
                            <p className="grow">Team</p>
                            <span className="iconify lucide--chevron-right size-3.5 -translate-x-1 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-60"></span>
                        </Link>
                        <Link to="#" className="menu-item group">
                            <span className="iconify lucide--calendar-days size-4"></span>
                            <p className="grow">Schedule</p>
                            <span className="iconify lucide--chevron-right size-3.5 -translate-x-1 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-60"></span>
                        </Link>
                        <Link to="#" className="menu-item group">
                            <span className="iconify lucide--file-text size-4"></span>
                            <p className="grow">Reports</p>
                            <span className="iconify lucide--chevron-right size-3.5 -translate-x-1 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-60"></span>
                        </Link>
                    </div>
                </div>
                <div className="mt-4">
                    <div className="flex items-center justify-between px-5">
                        <p className="menu-label">Favorite</p>
                        <button className="btn btn-xs btn-ghost btn-circle" aria-label="Add">
                            <span className="iconify lucide--plus size-4 opacity-60"></span>
                        </button>
                    </div>
                    <div className="mt-1 space-y-0.5 px-2.5">
                        <Link to="#" className="group menu-item justify-between">
                            <div className="flex items-center gap-2">
                                <span className="iconify lucide--search size-4"></span>
                                <p>Search Files</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="iconify lucide--star translate-x-2 text-orange-500 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100"></span>
                                <kbd className="kbd kbd-sm">P</kbd>
                            </div>
                        </Link>

                        <Link to="#" className="group menu-item justify-between">
                            <div className="flex items-center gap-2">
                                <span className="iconify lucide--file-plus size-4"></span>
                                <p>New File</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="iconify lucide--star translate-x-2 text-orange-500 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100"></span>
                                <kbd className="kbd kbd-sm">N</kbd>
                            </div>
                        </Link>

                        <Link to="#" className="group menu-item justify-between">
                            <div className="flex items-center gap-2">
                                <span className="iconify lucide--clock size-4"></span>
                                <p>Recent</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="iconify lucide--star translate-x-2 text-orange-500 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100"></span>
                                <kbd className="kbd kbd-sm">E</kbd>
                            </div>
                        </Link>
                    </div>
                </div>
                <div className="mt-4">
                    <div className="flex items-center justify-between px-5">
                        <p className="menu-label">Channels</p>
                        <button className="btn btn-xs btn-ghost btn-circle" aria-label="Add">
                            <span className="iconify lucide--plus size-4 opacity-60"></span>
                        </button>
                    </div>
                    <div className="mt-2 space-y-1 px-5">
                        <Link
                            to="#"
                            className="text-base-content/90 hover:text-primary flex items-center gap-2 transition-all">
                            <span className="iconify lucide--hash"></span>
                            general
                        </Link>
                        <Link
                            to="#"
                            className="text-base-content/90 hover:text-primary flex items-center gap-2 transition-all">
                            <span className="iconify lucide--hash"></span>
                            design
                        </Link>
                        <div className="text-base-content/90 flex items-center gap-2 transition-all">
                            <Link to="#" className="hover:text-primary flex grow items-center gap-2">
                                <span className="iconify lucide--hash"></span>
                                <p className="grow">meeting</p>
                            </Link>
                            <button
                                aria-label="Notification"
                                tabIndex={0}
                                className="btn btn-xs btn-circle btn-ghost"
                                popoverTarget="popover-1"
                                style={{ anchorName: "--anchor-1" }}>
                                <span className="iconify lucide--bell size-4"></span>
                            </button>
                            <ul
                                className="dropdown dropdown-end menu rounded-box bg-base-100 w-36 shadow hover:shadow-lg"
                                popover="auto"
                                id="popover-1"
                                style={{ positionAnchor: "--anchor-1" }}>
                                <li>
                                    <a>
                                        <span className="iconify lucide--bell size-4"></span>
                                        Normal
                                    </a>
                                </li>
                                <li>
                                    <a>
                                        <span className="iconify lucide--bell-off size-4"></span>
                                        Muted
                                    </a>
                                </li>
                                <li>
                                    <a>
                                        <span className="iconify lucide--bell-ring size-4"></span>
                                        Vibrate
                                    </a>
                                </li>
                                <li>
                                    <a>
                                        <span className="iconify lucide--bell-minus size-4"></span>
                                        Silent
                                    </a>
                                </li>
                            </ul>
                        </div>
                        <Link
                            to="#"
                            className="text-base-content/90 hover:text-primary flex items-center gap-2 transition-all">
                            <span className="iconify lucide--hash"></span>
                            support
                        </Link>
                    </div>
                </div>
            </div>
            <div className="border-base-300 relative mt-8 border-t px-5 pt-4">
                <div className="bg-base-100 border-base-300 absolute -top-7 translate-y-1/2 rounded-full border px-3 py-0.5">
                    <p className="text-base-content/70 text-sm">In Meeting</p>
                </div>
                <div className="mt-2 flex items-center justify-between">
                    <div className="avatar-group -ms-2 -space-x-3.5">
                        <div className="avatar border-2">
                            <div className="bg-base-200 size-7 rounded-full">
                                <img alt="Avatar" src="/images/avatars/4.png" />
                            </div>
                        </div>
                        <div className="avatar border-2">
                            <div className="bg-base-200 size-7 rounded-full">
                                <img alt="Avatar" src="/images/avatars/5.png" />
                            </div>
                        </div>
                        <div className="avatar border-2">
                            <div className="bg-base-200 size-7 rounded-full">
                                <img alt="Avatar" src="/images/avatars/7.png" />
                            </div>
                        </div>
                        <div className="avatar border-2">
                            <div className="bg-base-200 size-7 rounded-full">
                                <img alt="Avatar" src="/images/avatars/8.png" />
                            </div>
                        </div>
                    </div>
                    <span className="text-base-content/70 text-sm font-medium">12:42</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-1.5">
                    <button className="btn btn-sm btn-ghost btn-circle" aria-label="More">
                        <span className="iconify lucide--ellipsis-vertical size-4"></span>
                    </button>
                    <button className="btn btn-sm btn-ghost btn-circle" aria-label="Speaker">
                        <span className="iconify lucide--volume-2 size-4"></span>
                    </button>
                    <button className="btn btn-sm btn-ghost btn-circle" aria-label="Mute">
                        <span className="iconify lucide--mic size-4"></span>
                    </button>
                </div>
            </div>
        </div>
    );
};
