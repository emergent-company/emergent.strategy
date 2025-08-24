import { Link } from "react-router";

export const EcommerceSidebarDemo = () => {
    return (
        <div className="flex h-full w-full flex-col py-3">
            <div className="flex min-h-10 items-center justify-between gap-3 px-5">
                <span className="text-xl font-semibold">ACME Inc</span>
                <div className="flex items-center gap-2">
                    <label
                        htmlFor="layout-sidebar-hover-trigger"
                        title="Toggle sidebar hover"
                        className="btn btn-circle btn-ghost btn-sm text-base-content/50 relative max-lg:hidden">
                        <span className="iconify lucide--panel-left-close absolute size-4.5 opacity-100 transition-all duration-300 group-has-[[id=layout-sidebar-hover-trigger]:checked]/html:opacity-0" />
                        <span className="iconify lucide--panel-left-dashed absolute size-4.5 opacity-0 transition-all duration-300 group-has-[[id=layout-sidebar-hover-trigger]:checked]/html:opacity-100" />
                    </label>
                    <div className="dropdown dropdown-bottom dropdown-end">
                        <div tabIndex={0}>
                            <div className="avatar bg-base-200 size-8 cursor-pointer overflow-hidden rounded-full">
                                <img src="/images/avatars/1.png" alt="Avatar" />
                            </div>
                        </div>
                        <div tabIndex={0} className="dropdown-content bg-base-100 rounded-box mt-4 w-44 shadow">
                            <ul className="menu w-full p-2">
                                <li>
                                    <Link to="/pages/settings">
                                        <span className="iconify lucide--user size-4" />
                                        <span>My Profile</span>
                                    </Link>
                                </li>
                                <li>
                                    <Link to="/pages/settings">
                                        <span className="iconify lucide--settings size-4" />
                                        <span>Settings</span>
                                    </Link>
                                </li>
                                <li>
                                    <Link to="/pages/get-help">
                                        <span className="iconify lucide--help-circle size-4" />
                                        <span>Help</span>
                                    </Link>
                                </li>
                            </ul>
                            <hr className="border-base-300" />
                            <ul className="menu w-full p-2">
                                <li>
                                    <div>
                                        <span className="iconify lucide--arrow-left-right size-4" />
                                        <span>Switch Account</span>
                                    </div>
                                </li>
                                <li>
                                    <Link className="text-error hover:bg-error/10" to="/auth/login">
                                        <span className="iconify lucide--log-out size-4" />
                                        <span>Logout</span>
                                    </Link>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
            <div className="sidebar-menu custom-scrollbar grow overflow-auto px-2.5">
                <p className="menu-label mt-2 px-2.5">Navigation</p>
                <div className="mt-2">
                    <Link className="menu-item" to="#">
                        <span className="iconify lucide--monitor-dot size-4"></span>
                        <span className="grow">Dashboard</span>
                    </Link>
                </div>
                <p className="menu-label mt-2 px-2.5">Manage</p>
                <div className="mt-2 space-y-0.5">
                    <div className="collapse">
                        <input aria-label="Sidemenu item trigger" className="peer" type="checkbox" />
                        <div className="collapse-title px-2.5 py-1.5">
                            <span className="iconify lucide--package size-4"></span>
                            <span className="grow">Products</span>
                            <span className="iconify lucide--chevron-right arrow-icon size-3.5"></span>
                        </div>
                        <div className="collapse-content ms-6.5 !p-0">
                            <div className="mt-0.5 space-y-0.5">
                                <Link className="menu-item" to="#">
                                    <span className="grow">All Products</span>
                                </Link>
                                <Link className="menu-item" to="#">
                                    <span className="grow">Add New</span>
                                </Link>
                                <Link className="menu-item" to="#">
                                    <span className="grow">Categories</span>
                                </Link>
                            </div>
                        </div>
                    </div>
                    <div className="collapse">
                        <input aria-label="Sidemenu item trigger" className="peer" type="checkbox" />
                        <div className="collapse-title px-2.5 py-1.5">
                            <span className="iconify lucide--receipt-text size-4"></span>
                            <span className="grow">Orders</span>
                            <span className="iconify lucide--chevron-right arrow-icon size-3.5"></span>
                        </div>
                        <div className="collapse-content ms-6.5 !p-0">
                            <div className="mt-0.5 space-y-0.5">
                                <Link className="menu-item" to="#">
                                    <span className="grow">All Order</span>
                                </Link>
                                <Link className="menu-item" to="#">
                                    <span className="grow">Returns</span>
                                </Link>
                            </div>
                        </div>
                    </div>
                    <Link className="menu-item" to="#">
                        <span className="iconify lucide--users size-4"></span>
                        <span className="grow">Customers</span>
                    </Link>
                    <Link className="menu-item" to="#">
                        <span className="iconify lucide--warehouse size-4"></span>
                        <span className="grow">Inventory</span>
                    </Link>
                    <Link className="menu-item" to="#">
                        <span className="iconify lucide--dollar-sign size-4"></span>
                        <span className="grow">Payouts</span>
                    </Link>
                </div>
                <p className="menu-label mt-2 px-2.5">Other</p>
                <div className="mt-2 space-y-0.5">
                    <div className="collapse">
                        <input aria-label="Sidemenu item trigger" className="peer" type="checkbox" />
                        <div className="collapse-title px-2.5 py-1.5">
                            <span className="iconify lucide--align-center size-4"></span>
                            <span className="grow">Menu Levels</span>
                            <span className="iconify lucide--chevron-right arrow-icon size-3.5"></span>
                        </div>
                        <div className="collapse-content ms-6.5 !p-0">
                            <div className="mt-0.5 space-y-0.5">
                                <Link className="menu-item" to="#">
                                    <span className="grow">Level 1a</span>
                                </Link>
                                <div className="collapse">
                                    <input aria-label="Sidemenu item trigger" className="peer" type="checkbox" />
                                    <div className="collapse-title px-2.5 py-1.5">
                                        <span className="grow">Level 1b</span>
                                        <span className="iconify lucide--chevron-right arrow-icon size-3.5"></span>
                                    </div>
                                    <div className="collapse-content ms-6.5 !p-0">
                                        <div className="mt-0.5 space-y-0.5">
                                            <Link className="menu-item" to="#">
                                                <span className="grow">Level 2a</span>
                                            </Link>
                                            <div className="group collapse">
                                                <input
                                                    aria-label="Sidemenu item trigger"
                                                    className="peer"
                                                    type="checkbox"
                                                />
                                                <div className="collapse-title px-2.5 py-1.5">
                                                    <span className="grow">Level 2b</span>
                                                    <span className="iconify lucide--chevron-right arrow-icon size-3.5"></span>
                                                </div>
                                                <div className="collapse-content ms-6.5 !p-0">
                                                    <div className="mt-0.5 space-y-0.5">
                                                        <Link className="menu-item" to="#">
                                                            <span className="grow">Level 3a</span>
                                                        </Link>
                                                        <Link className="menu-item" to="#">
                                                            <span className="grow">Level 3b</span>
                                                        </Link>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <Link className="menu-item" target="_blank" to="https://google.com">
                        <span className="iconify lucide--external-link size-4"></span>
                        <span className="grow">External Links</span>
                    </Link>
                    <Link className="menu-item" to="#">
                        <span className="iconify lucide--award size-4"></span>
                        <span className="grow">Label</span>
                        <div className="ms-auto inline-flex gap-2">
                            <div className="bg-secondary text-secondary-content rounded-box ms-0 px-1.5 text-[12px]">
                                +8
                            </div>
                        </div>
                    </Link>
                </div>
            </div>
            <div className="border-base-200 rounded-box relative mx-3 mt-3 border p-3">
                <p className="font-medium">5 Days left!</p>
                <progress className="progress progress-warning h-1 align-super" max="100" value="70"></progress>
                <p className="text-base-content/80 -mt-1.5 text-sm leading-tight">
                    Trial ending soon. Upgrade to stay active.
                </p>
                <button className="btn btn-soft btn-xs btn-circle absolute end-2 top-2" aria-label="Close">
                    <span className="iconify lucide--x size-3.5"></span>
                </button>
            </div>
            <div className="border-base-200 sidebar-menu mt-3 space-y-0.5 border-t px-2.5 pt-2">
                <Link className="menu-item" to="#">
                    <span className="iconify lucide--badge-info size-4"></span>
                    <span className="grow">Help & Support</span>
                </Link>
                <Link className="menu-item" to="#">
                    <span className="iconify lucide--headphones size-4"></span>
                    <span className="grow">Contact us</span>
                </Link>
            </div>
        </div>
    );
};
