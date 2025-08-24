import { Link } from "react-router";

export const SplitMenuDemo = () => {
    return (
        <div className="dropdown dropdown-bottom sm:dropdown-end max-sm:dropdown-center">
            <div tabIndex={0} className="flex cursor-pointer items-center gap-3">
                <div className="avatar bg-base-200 size-12 overflow-hidden rounded-full px-1 pt-1">
                    <img src="/images/avatars/6.png" alt="Avatar" />
                </div>
            </div>

            <div tabIndex={0} className="dropdown-content mt-2 w-54">
                <div className="bg-base-100 rounded-box shadow-lg">
                    <ul className="menu w-full p-2">
                        <li>
                            <Link to="#">
                                <span className="iconify lucide--layout-dashboard size-4.5" />
                                <span>Project Overview</span>
                            </Link>
                        </li>
                        <li>
                            <Link to="#">
                                <span className="iconify lucide--folder-open size-4.5" />
                                <span>My Workspaces</span>
                            </Link>
                        </li>
                    </ul>
                </div>

                <div className="bg-base-100 rounded-box mt-1.5 shadow-lg">
                    <ul className="menu w-full p-2">
                        <li className="menu-title">Select Team</li>
                        <li>
                            <div>
                                <div className="from-primary to-primary/80 mask mask-squircle text-primary-content flex size-5 items-center justify-center bg-linear-to-b leading-none font-medium">
                                    C
                                </div>
                                <p className="grow text-sm">Creative Hub</p>
                            </div>
                        </li>
                        <li>
                            <div>
                                <div className="from-secondary to-secondary/80 mask mask-squircle text-secondary-content flex size-5 items-center justify-center bg-linear-to-b leading-none font-medium">
                                    D
                                </div>
                                <p className="grow text-sm">Design Squad</p>
                                <span className="iconify lucide--check size-4 opacity-60"></span>
                            </div>
                        </li>
                        <li>
                            <div>
                                <div className="from-error to-error/80 mask mask-squircle text-error-content flex size-5 items-center justify-center bg-linear-to-b leading-none font-medium">
                                    M
                                </div>
                                <p className="grow text-sm">Marketing Team</p>
                            </div>
                        </li>
                    </ul>
                </div>

                <div className="bg-base-100 rounded-box mt-1.5 shadow-lg">
                    <ul className="menu w-full p-2">
                        <li>
                            <div>
                                <span className="iconify lucide--repeat size-4.5" />
                                <span>Switch Team</span>
                            </div>
                        </li>
                        <li>
                            <Link className="text-error hover:bg-error/10" to="#">
                                <span className="iconify lucide--log-out size-4.5" />
                                <span>Sign Out</span>
                            </Link>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    );
};
