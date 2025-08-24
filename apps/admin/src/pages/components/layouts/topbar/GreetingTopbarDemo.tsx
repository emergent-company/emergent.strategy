import { Link } from "react-router";

export const GreetingTopbarDemo = () => {
    return (
        <div className="flex h-full w-full items-center justify-between px-4">
            <div className="flex items-center gap-2 sm:gap-3">
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
                <div>
                    <p className="leading-none font-medium md:text-lg">
                        Good Morning<span className="max-sm:hidden">, Denish!</span>
                    </p>
                    <p className="text-base-content/60 mt-1 text-sm/none max-sm:hidden">
                        Welcome back, great to see you again!
                    </p>
                </div>
            </div>
            <div className="flex items-center gap-4">
                <div className="dropdown dropdown-bottom dropdown-end">
                    <div tabIndex={0} className="flex cursor-pointer items-center gap-2">
                        <div className="avatar bg-base-200 rounded-box size-7 overflow-hidden">
                            <img src="/images/avatars/1.png" alt="Avatar" />
                        </div>
                        <div>
                            <p className="leading-none font-medium">Denish</p>
                            <p className="text-base-content/60 mt-0 text-xs/none">@withden</p>
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
