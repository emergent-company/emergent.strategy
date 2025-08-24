import { Link } from "react-router";

export const TopbarWithTitleDemo = () => {
    return (
        <div className="w-full">
            <div className="bg-base-100 border-base-200 flex h-15 items-center justify-between border-b px-4">
                <div className="*:rounded-box flex items-center gap-0.5 text-sm *:px-2.5 *:py-1 *:transition-all *:hover:opacity-70 max-md:hidden">
                    <Link to="#">Overview</Link>
                    <Link to="#">Insights</Link>
                    <Link to="#">Team</Link>
                    <Link to="#">Reports</Link>
                    <Link to="#">Settings</Link>
                    <Link to="#">Support</Link>
                </div>
                <button className="btn btn-sm btn-ghost btn-square md:hidden">
                    <span className="iconify lucide--menu size-5"></span>
                </button>
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
                            <div className="avatar bg-base-200 ring-success h-7 overflow-hidden rounded-full ring">
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
            <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-3">
                    <p className="text-base-content font-medium sm:text-lg">Team Performance</p>
                    <hr className="border-base-200 h-5 w-px border-e max-sm:hidden" />
                    <p className="text-base-content/60 text-sm font-medium max-sm:hidden">Workspace ID: #TEAM-9271</p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-0.5">
                        <button className="btn btn-ghost btn-sm">Day</button>
                        <button className="btn btn-ghost btn-active btn-sm">Week</button>
                        <button className="btn btn-ghost btn-sm max-sm:hidden">Month</button>
                        <button className="btn btn-ghost btn-sm max-md:hidden">Quarter</button>
                    </div>
                </div>
            </div>
        </div>
    );
};
