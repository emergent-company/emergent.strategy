import { Link } from "react-router";

export const AccountListMenuDemo = () => {
    return (
        <div className="dropdown dropdown-bottom sm:dropdown-end max-sm:dropdown-center">
            <div tabIndex={0} className="flex cursor-pointer items-center gap-3">
                <div className="avatar bg-base-200 size-12 overflow-hidden rounded-full px-1 pt-1">
                    <img src="/images/avatars/5.png" alt="Avatar" />
                </div>
            </div>

            <div tabIndex={0} className="dropdown-content bg-base-100 rounded-box mt-2 w-64 shadow">
                <div className="bg-base-200/40 rounded-box mx-2 mt-2 cursor-pointer items-start gap-3 px-3 py-3">
                    <div className="flex justify-between">
                        <div className="avatar bg-base-200 size-12 overflow-hidden rounded-full px-1 pt-1">
                            <img src="/images/avatars/5.png" alt="Avatar" />
                        </div>
                        <div className="avatar-group -space-x-3.5 *:border-2 *:transition-all hover:space-x-0.5 hover:*:shadow-sm">
                            <div className="avatar bg-base-200 size-9 overflow-hidden rounded-full px-1 pt-1">
                                <img src="/images/avatars/1.png" alt="Avatar" />
                            </div>
                            <div className="avatar bg-base-200 size-9 overflow-hidden rounded-full px-1 pt-1">
                                <img src="/images/avatars/2.png" alt="Avatar" />
                            </div>
                            <div className="avatar bg-base-200 size-9 overflow-hidden rounded-full px-1 pt-1">
                                <img src="/images/avatars/3.png" alt="Avatar" />
                            </div>
                        </div>
                    </div>

                    <div className="mt-2">
                        <p className="font-medium">Michael Adams</p>
                        <p className="text-base-content/70 text-sm/none">michael.adams@mail.com</p>
                    </div>
                </div>

                <ul className="menu w-full p-2">
                    <li>
                        <Link to="#">
                            <span className="iconify lucide--users size-4.5" />
                            <span>Team Members</span>
                        </Link>
                    </li>
                    <li>
                        <Link to="#">
                            <span className="iconify lucide--shield-check size-4.5" />
                            <span>Roles & Permissions</span>
                        </Link>
                    </li>
                    <li>
                        <Link to="#">
                            <span className="iconify lucide--folder-kanban size-4.5" />
                            <span>Shared Projects</span>
                        </Link>
                    </li>
                </ul>

                <hr className="border-base-200" />

                <ul className="menu w-full p-2">
                    <li>
                        <Link to="#">
                            <span className="iconify lucide--repeat size-4.5" />
                            <span>Switch Team</span>
                        </Link>
                    </li>
                    <li>
                        <Link className="text-error hover:bg-error/10" to="#">
                            <span className="iconify lucide--log-out size-4.5" />
                            <span>Leave Team</span>
                        </Link>
                    </li>
                </ul>
            </div>
        </div>
    );
};
