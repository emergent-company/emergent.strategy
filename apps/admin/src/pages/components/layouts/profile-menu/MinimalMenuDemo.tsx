import { Link } from "react-router";

export const MinimalMenuDemo = () => {
    return (
        <div className="dropdown dropdown-bottom sm:dropdown-end max-sm:dropdown-center">
            <div
                tabIndex={0}
                className="avatar bg-base-200 size-12 cursor-pointer overflow-hidden rounded-full px-1 pt-1">
                <img src="/images/avatars/1.png" alt="Avatar" />
            </div>
            <div tabIndex={0} className="dropdown-content bg-base-100 rounded-box mt-2 w-54 shadow">
                <ul className="menu w-full p-2">
                    <li>
                        <Link to="#">
                            <span className="iconify lucide--user-circle size-4.5" />
                            <span>Profile</span>
                        </Link>
                    </li>
                    <li>
                        <Link to="#">
                            <span className="iconify lucide--mail-plus size-4.5" />
                            <span>Invitations</span>
                            <div className="badge badge-sm">4</div>
                        </Link>
                    </li>
                    <li>
                        <Link to="#">
                            <span className="iconify lucide--star size-4.5" />
                            <span>Favorites</span>
                        </Link>
                    </li>
                </ul>

                <hr className="border-base-200" />

                <ul className="menu w-full p-2">
                    <li>
                        <Link to="#">
                            <span className="iconify lucide--settings-2 size-4.5" />
                            <span>Settings</span>
                        </Link>
                    </li>
                    <li>
                        <Link to="#">
                            <span className="iconify lucide--file-text size-4.5" />
                            <span>My Content</span>
                        </Link>
                    </li>
                    <li>
                        <Link to="#">
                            <span className="iconify lucide--box size-4.5" />
                            <span>Library</span>
                        </Link>
                    </li>
                </ul>

                <hr className="border-base-200" />

                <ul className="menu w-full p-2">
                    <li>
                        <div>
                            <span className="iconify lucide--arrow-left-right size-4.5" />
                            <span>Switch User</span>
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
