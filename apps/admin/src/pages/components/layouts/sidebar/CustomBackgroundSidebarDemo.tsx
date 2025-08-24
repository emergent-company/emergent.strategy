export const CustomBackgroundSidebarDemo = () => {
    return (
        <div className="sidebar-menu relative h-full w-full overflow-hidden py-3">
            <div className="absolute start-10 top-8 h-44 w-32 bg-blue-500/50 blur-[180px]"></div>
            <div className="absolute start-10 bottom-8 h-44 w-32 rounded-full bg-purple-500/50 blur-[180px]"></div>

            <label
                htmlFor="layout-sidebar-hover-trigger"
                title="Toggle sidebar hover"
                className="btn btn-circle btn-ghost btn-sm text-base-content/50 absolute end-2 top-3.5 z-10 max-lg:hidden">
                <span className="iconify lucide--panel-left-close absolute size-4.5 opacity-100 transition-all duration-300 group-has-[[id=layout-sidebar-hover-trigger]:checked]/html:opacity-0" />
                <span className="iconify lucide--panel-left-dashed absolute size-4.5 opacity-0 transition-all duration-300 group-has-[[id=layout-sidebar-hover-trigger]:checked]/html:opacity-100" />
            </label>
            <div className="relative flex h-full w-full flex-col">
                <div className="flex min-h-10 items-center gap-3 px-5">
                    <span className="text-xl font-semibold">ACME Inc</span>
                    <hr className="border-base-300 h-5 border-e" />
                    <p className="text-base-content/50 text-sm font-medium">Control</p>
                </div>

                <div className="custom-scrollbar mt-3 grow overflow-auto">
                    <div className="space-y-0.5 px-2.5">
                        <a href="#" className="menu-item group from-primary to-secondary hover:bg-linear-to-r">
                            <i className="iconify lucide--wand-2 text-primary size-4 group-hover:text-white"></i>
                            <p className="from-primary to-secondary bg-gradient-to-r bg-clip-text text-base font-medium text-transparent group-hover:text-white">
                                AI Assistant
                            </p>
                        </a>
                        <a href="#" className="menu-item">
                            <i className="iconify lucide--layout-dashboard size-4"></i>
                            <p>Dashboard</p>
                        </a>
                        <a href="#" className="menu-item">
                            <i className="iconify lucide--bar-chart-3 size-4"></i>
                            <p>Analytics</p>
                        </a>
                    </div>

                    <p className="menu-label mt-4 px-5">Management</p>
                    <div className="mt-1 space-y-0.5 px-2.5">
                        <a href="#" className="menu-item">
                            <i className="iconify lucide--users size-4"></i>
                            <p>Users</p>
                        </a>
                        <a href="#" className="menu-item">
                            <i className="iconify lucide--credit-card size-4"></i>
                            <p>Billing</p>
                        </a>
                        <a href="#" className="menu-item">
                            <i className="iconify lucide--calendar-clock size-4"></i>
                            <p>Plans</p>
                        </a>
                        <a href="#" className="menu-item">
                            <i className="iconify lucide--briefcase size-4"></i>
                            <p>Teams</p>
                        </a>
                    </div>

                    <p className="menu-label mt-4 px-5">Content</p>
                    <div className="mt-1 space-y-0.5 px-2.5">
                        <a href="#" className="menu-item">
                            <i className="iconify lucide--file-text size-4"></i>
                            <p>Pages</p>
                        </a>
                        <a href="#" className="menu-item">
                            <i className="iconify lucide--image size-4"></i>
                            <p>Media</p>
                        </a>
                        <a href="#" className="menu-item">
                            <i className="iconify lucide--paintbrush size-4"></i>
                            <p>Appearance</p>
                        </a>
                    </div>
                </div>

                <div className="mt-4 px-2.5">
                    <a href="#" className="menu-item">
                        <i className="iconify lucide--user size-4"></i>
                        <p>My Profile</p>
                    </a>
                    <a href="#" className="menu-item">
                        <i className="iconify lucide--settings size-4"></i>
                        <p>Settings</p>
                    </a>
                    <a href="#" className="menu-item">
                        <i className="iconify lucide--log-out size-4"></i>
                        <p>Sign Out</p>
                    </a>
                </div>
            </div>
        </div>
    );
};
