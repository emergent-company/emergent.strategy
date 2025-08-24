import { Link } from "react-router";

export const NavMenu2TopbarDemo = () => {
    return (
        <div className="flex h-full w-full items-center justify-between px-4">
            <div className="flex items-center gap-0">
                <label
                    className="btn btn-square btn-ghost btn-sm group-has-[[id=layout-sidebar-hover-trigger]:checked]/html:hidden"
                    aria-label="Sidebar toggle"
                    htmlFor="layout-sidebar-toggle-trigger">
                    <span className="iconify lucide--menu size-5" />
                </label>
                <label
                    className="btn btn-square btn-ghost btn-sm hidden group-has-[[id=layout-sidebar-hover-trigger]:checked]/html:flex"
                    aria-label="Leftmenu toggle"
                    htmlFor="layout-sidebar-hover-trigger">
                    <span className="iconify lucide--menu size-5" />
                </label>
                <div className="*:rounded-box flex items-center gap-0.5 text-sm *:px-2.5 *:py-1 *:transition-all *:hover:opacity-70 max-md:hidden">
                    <Link to="#">Dashboard</Link>
                    <Link to="#">Analytics</Link>
                    <Link to="#">Settings</Link>
                    <Link to="#">Users</Link>
                    <Link to="#">Reports</Link>
                    <Link to="#">Support</Link>
                </div>
            </div>
            <div className="flex items-center">
                <button className="btn btn-circle btn-ghost btn-sm me-1" aria-label="Search">
                    <span className="iconify lucide--search text-base-content/80 size-5"></span>
                </button>
                <button className="btn btn-circle btn-ghost btn-sm me-1" aria-label="Notifications">
                    <span className="iconify lucide--bell-ring text-base-content/80 size-5"></span>
                </button>
                <button className="btn btn-circle btn-ghost btn-sm me-3" aria-label="Apps">
                    <span className="iconify lucide--component text-base-content/80 size-5.5 rotate-45"></span>
                </button>
                <div className="dropdown dropdown-bottom dropdown-end">
                    <div tabIndex={0} className="cursor-pointer">
                        <div className="avatar bg-base-200 ring-success size-7 overflow-hidden rounded-full ring">
                            <img src="/images/avatars/1.png" alt="Avatar" />
                        </div>
                    </div>
                    <div tabIndex={0} className="dropdown-content bg-base-100 rounded-box mt-2 w-44 shadow">
                        <ul className="menu w-full p-2">
                            <li>
                                <Link to="#">
                                    <span className="iconify lucide--user size-4" />
                                    <span>My Profile</span>
                                </Link>
                            </li>
                            <li>
                                <Link to="#">
                                    <span className="iconify lucide--settings size-4" />
                                    <span>Settings</span>
                                </Link>
                            </li>
                            <li>
                                <Link to="#">
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
                                <Link className="text-error hover:bg-error/10" to="#">
                                    <span className="iconify lucide--log-out size-4" />
                                    <span>Logout</span>
                                </Link>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};
