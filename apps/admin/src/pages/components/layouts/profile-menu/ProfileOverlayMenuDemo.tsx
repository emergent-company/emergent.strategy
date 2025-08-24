import { Link } from "react-router";

export const ProfileOverlayMenuDemo = () => {
    return (
        <div className="dropdown dropdown-bottom dropdown-end">
            <div tabIndex={0} className="flex cursor-pointer items-center gap-3">
                <div className="avatar from-primary to-primary/80 size-12 overflow-hidden rounded-full bg-linear-to-b px-1 pt-1">
                    <img src="/images/avatars/3.png" alt="Avatar" />
                </div>
                <div>
                    <p className="font-medium">David Lee</p>
                    <p className="text-primary -mt-1 text-sm">david.lee@mail.com</p>
                </div>
                <div className="bg-base-100 flex h-fit items-center justify-center rounded-full p-1 shadow">
                    <span className="iconify lucide--chevron-down size-4"></span>
                </div>
            </div>

            <div tabIndex={0} className="dropdown-content bg-base-100 rounded-box -mt-12 w-64 shadow">
                <div className="hover:bg-base-200/30 rounded-t-box flex cursor-pointer items-start gap-3 px-4 py-2.5">
                    <div className="avatar bg-base-200 size-10 overflow-hidden rounded-full px-1 pt-1">
                        <img src="/images/avatars/3.png" alt="Avatar" />
                    </div>
                    <div className="grow">
                        <p className="font-medium">David Lee</p>
                        <p className="text-base-content/70 text-sm/none">david.lee@mail.com</p>
                    </div>
                    <span className="iconify lucide--shield-check text-info size-5"></span>
                </div>

                <hr className="border-base-200" />

                <ul className="menu w-full p-2">
                    <li>
                        <Link to="#">
                            <span className="iconify lucide--sliders-horizontal size-4.5" />
                            <span>Preferences</span>
                        </Link>
                    </li>
                    <li>
                        <Link to="#">
                            <span className="iconify lucide--folder-open size-4.5" />
                            <span>My Files</span>
                        </Link>
                    </li>
                    <li>
                        <Link to="#">
                            <span className="iconify lucide--library-big size-4.5" />
                            <span>Collections</span>
                        </Link>
                    </li>
                </ul>

                <hr className="border-base-200" />

                <ul className="menu w-full p-2">
                    <li>
                        <Link className="text-error hover:bg-error/10" to="#">
                            <span className="iconify lucide--log-out size-4.5" />
                            <span>Log Out</span>
                        </Link>
                    </li>
                </ul>

                <p className="text-base-content/60 px-5 pb-3 text-sm italic">
                    Managed by <span className="underline">Nexus</span>
                </p>
            </div>
        </div>
    );
};
