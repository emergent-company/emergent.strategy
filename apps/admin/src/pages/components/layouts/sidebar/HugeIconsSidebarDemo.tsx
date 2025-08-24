export const HugeIconsSidebarDemo = () => {
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
                <p className="text-base-content/50 text-sm font-medium">24/7</p>
            </div>

            <div className="custom-scrollbar grow overflow-auto">
                <div className="mt-3 space-y-0.5 px-2.5">
                    <a href="#" className="menu-item">
                        <i className="iconify hugeicons--dashboard-speed-02 size-4.5"></i>
                        <p>Overview</p>
                    </a>
                    <a href="#" className="menu-item">
                        <i className="iconify hugeicons--calendar-favorite-02 size-4.5"></i>
                        <p>Appointments</p>
                    </a>
                </div>
                <p className="menu-label mt-4 px-5">Management</p>
                <div className="mt-1 space-y-0.5 px-2.5">
                    <a href="#" className="menu-item">
                        <i className="iconify hugeicons--user-group size-4.5"></i>
                        <p>Patients</p>
                    </a>
                    <a href="#" className="menu-item">
                        <i className="iconify hugeicons--dollar-receive-02 size-4.5"></i>
                        <p>Billing</p>
                    </a>
                    <a href="#" className="menu-item">
                        <i className="iconify hugeicons--note-edit size-4.5"></i>
                        <p>Prescriptions</p>
                    </a>
                </div>

                <p className="menu-label mt-4 px-5">Administration</p>
                <div className="mt-1 space-y-0.5 px-2.5">
                    <a href="#" className="menu-item">
                        <i className="iconify hugeicons--user-settings-01 size-4.5"></i>
                        <p>Staffs</p>
                    </a>
                    <a href="#" className="menu-item">
                        <i className="iconify hugeicons--doc-01 size-4.5"></i>
                        <p>Reports</p>
                    </a>
                    <a href="#" className="menu-item">
                        <i className="iconify hugeicons--notebook-01 size-4.5"></i>
                        <p>Inventory</p>
                    </a>
                    <a href="#" className="menu-item">
                        <i className="iconify hugeicons--settings-04 size-4.5"></i>
                        <p>System</p>
                    </a>
                </div>
            </div>

            <div className="mt-4 px-2.5">
                <a href="#" className="menu-item">
                    <i className="iconify hugeicons--user-circle size-4.5"></i>
                    <p>Profile</p>
                </a>
                <a href="#" className="menu-item">
                    <i className="iconify hugeicons--settings-03 size-4.5"></i>
                    <p>Settings</p>
                </a>
                <a href="#" className="menu-item">
                    <i className="iconify hugeicons--logout-03 size-4.5"></i>
                    <p>Logout</p>
                </a>
            </div>
        </div>
    );
};
