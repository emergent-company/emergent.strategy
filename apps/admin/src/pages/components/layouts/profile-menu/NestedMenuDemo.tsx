import { Link } from "react-router";

export const NestedMenuDemo = () => {
    return (
        <div className="dropdown dropdown-bottom sm:dropdown-end max-sm:dropdown-center">
            <div tabIndex={0} className="flex cursor-pointer items-center gap-3">
                <div className="avatar bg-base-200 size-12 overflow-hidden rounded-full px-1 pt-1">
                    <img src="/images/avatars/7.png" alt="Avatar" />
                </div>
            </div>

            <div tabIndex={0} className="dropdown-content bg-base-100 rounded-box mt-2 w-56 shadow">
                <ul className="menu w-full p-2">
                    <li>
                        <Link to="#">
                            <span className="iconify lucide--user size-4.5" />
                            <span>My Profile</span>
                        </Link>
                    </li>
                    <li>
                        <Link to="#">
                            <span className="iconify lucide--heart size-4.5" />
                            <span>Saved Items</span>
                        </Link>
                    </li>
                </ul>

                <hr className="border-base-200" />

                <ul className="menu w-full p-2">
                    <li>
                        <details>
                            <summary>
                                <div className="flex cursor-pointer items-center gap-3">
                                    <span className="iconify lucide--bell size-4.5" />
                                    <p>Notifications</p>
                                </div>
                            </summary>
                            <ul className="ms-5.5">
                                <li>
                                    <Link to="#">
                                        <span>Mute Alerts</span>
                                    </Link>
                                </li>
                                <li>
                                    <Link to="#">
                                        <span>Settings</span>
                                    </Link>
                                </li>
                            </ul>
                        </details>
                    </li>
                    <li>
                        <details>
                            <summary>
                                <div className="flex cursor-pointer items-center gap-3">
                                    <span className="iconify lucide--paintbrush size-4.5" />
                                    <p>Appearance</p>
                                </div>
                            </summary>
                            <ul className="ms-5.5">
                                <li>
                                    <Link to="#">
                                        <span>Dark Mode</span>
                                    </Link>
                                </li>
                                <li>
                                    <Link to="#">
                                        <span>Light Mode</span>
                                    </Link>
                                </li>
                            </ul>
                        </details>
                    </li>

                    <li>
                        <details>
                            <summary>
                                <div className="flex cursor-pointer items-center gap-3">
                                    <span className="iconify lucide--settings size-4.5" />
                                    <p>Preferences</p>
                                </div>
                            </summary>
                            <ul className="ms-5.5">
                                <li>
                                    <Link to="#">
                                        <span>Language</span>
                                    </Link>
                                </li>
                                <li>
                                    <Link to="#">
                                        <span>Time Zone</span>
                                    </Link>
                                </li>
                            </ul>
                        </details>
                    </li>
                </ul>

                <hr className="border-base-200" />

                <ul className="menu w-full p-2">
                    <li>
                        <div>
                            <span className="iconify lucide--users size-4.5" />
                            <span>Switch Account</span>
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
    );
};
