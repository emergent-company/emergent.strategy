export const RemixIconsSidebarDemo = () => {
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
                <p className="text-base-content/50 text-sm font-medium">Open</p>
            </div>

            <div className="custom-scrollbar grow overflow-auto">
                <div className="mt-3 space-y-0.5 px-2.5">
                    <a href="#" className="menu-item">
                        <i className="iconify ri--dashboard-line size-4"></i>
                        <p>Dashboard</p>
                    </a>
                    <a href="#" className="menu-item">
                        <i className="iconify ri--bar-chart-2-line size-4"></i>
                        <p>Analytics</p>
                    </a>
                </div>

                <p className="menu-label mt-4 px-5">E-commerce</p>
                <div className="mt-1 space-y-0.5 px-2.5">
                    <a href="#" className="menu-item">
                        <i className="iconify ri--box-3-line size-4"></i>
                        <p>Products</p>
                    </a>
                    <a href="#" className="menu-item">
                        <i className="iconify ri--shopping-cart-line size-4"></i>
                        <p>Orders</p>
                    </a>
                    <a href="#" className="menu-item">
                        <i className="iconify ri--user-line size-4"></i>
                        <p>Customers</p>
                    </a>
                    <a href="#" className="menu-item">
                        <i className="iconify ri--price-tag-3-line size-4"></i>
                        <p>Discounts</p>
                    </a>
                </div>

                <p className="menu-label mt-4 px-5">Content & Design</p>
                <div className="mt-1 space-y-0.5 px-2.5">
                    <a href="#" className="menu-item">
                        <i className="iconify ri--file-text-line size-4"></i>
                        <p>Pages</p>
                    </a>
                    <a href="#" className="menu-item">
                        <i className="iconify ri--image-line size-4"></i>
                        <p>Media</p>
                    </a>
                    <a href="#" className="menu-item">
                        <i className="iconify ri--palette-line size-4"></i>
                        <p>Themes</p>
                    </a>
                </div>
            </div>

            <div className="mt-4 px-2.5">
                <a href="#" className="menu-item">
                    <i className="iconify ri--user-3-line size-4"></i>
                    <p>My Profile</p>
                </a>
                <a href="#" className="menu-item">
                    <i className="iconify ri--settings-3-line size-4"></i>
                    <p>Settings</p>
                </a>
                <a href="#" className="menu-item">
                    <i className="iconify ri--logout-box-line size-4"></i>
                    <p>Sign Out</p>
                </a>
            </div>
        </div>
    );
};
