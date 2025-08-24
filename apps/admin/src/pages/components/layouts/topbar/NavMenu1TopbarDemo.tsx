import { Link } from "react-router";

export const NavMenu1TopbarDemo = () => {
    return (
        <div className="flex h-full w-full items-center justify-between px-4">
            <div className="flex items-center gap-3">
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
                <div className="*:hover:bg-base-200 *:rounded-box flex items-center gap-0.5 text-sm *:px-2.5 *:py-1 max-sm:hidden">
                    <Link to="#" className="!bg-primary/10 text-primary font-medium">
                        Apps
                    </Link>
                    <Link to="#">Components</Link>
                    <Link to="#">Pages</Link>
                </div>
            </div>
            <div className="flex items-center">
                <button className="btn btn-square btn-ghost btn-sm me-1" aria-label="Search">
                    <span className="iconify lucide--search size-5"></span>
                </button>
                <button className="btn btn-square btn-ghost btn-sm me-3" aria-label="Notifications">
                    <span className="iconify lucide--bell-ring size-5"></span>
                </button>
                <div className="dropdown dropdown-bottom dropdown-center me-3">
                    <div tabIndex={0} className="cursor-pointer">
                        <img
                            src="https://flagcdn.com/us.svg"
                            alt="Avatar"
                            className="rounded-box size-5.5 object-cover"
                        />
                    </div>
                    <div tabIndex={0} className="dropdown-content bg-base-100 rounded-box mt-2 w-40 shadow">
                        <ul className="menu w-full p-2">
                            <li>
                                <Link to="#" className="flex items-center gap-2">
                                    <img
                                        src="https://flagcdn.com/us.svg"
                                        alt="Avatar"
                                        className="rounded-box size-4.5 cursor-pointer object-cover"
                                    />
                                    <span>English</span>
                                </Link>
                            </li>
                            <li>
                                <Link to="#" className="flex items-center gap-2">
                                    <img
                                        src="https://flagcdn.com/in.svg"
                                        alt="Avatar"
                                        className="rounded-box size-4.5 cursor-pointer object-cover"
                                    />
                                    <span>Hindi</span>
                                </Link>
                            </li>
                            <li>
                                <Link to="#" className="flex items-center gap-2">
                                    <img
                                        src="https://flagcdn.com/es.svg"
                                        alt="Avatar"
                                        className="rounded-box size-4.5 cursor-pointer object-cover"
                                    />
                                    <span>Spanish</span>
                                </Link>
                            </li>
                            <li>
                                <Link to="#" className="flex items-center gap-2">
                                    <img
                                        src="https://flagcdn.com/cn.svg"
                                        alt="Avatar"
                                        className="rounded-box size-4.5 cursor-pointer object-cover"
                                    />
                                    <span>Chinese</span>
                                </Link>
                            </li>
                            <li>
                                <Link to="#" className="flex items-center gap-2">
                                    <img
                                        src="https://flagcdn.com/rs.svg"
                                        alt="Avatar"
                                        className="rounded-box size-4.5 cursor-pointer object-cover"
                                    />
                                    <span>Arabic</span>
                                </Link>
                            </li>
                        </ul>
                    </div>
                </div>
                <div className="border-base-300 me-3 h-7 border-e"></div>
                <div className="dropdown dropdown-bottom dropdown-end">
                    <div tabIndex={0} className="cursor-pointer">
                        <div className="avatar bg-base-200 rounded-box size-7 overflow-hidden">
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
