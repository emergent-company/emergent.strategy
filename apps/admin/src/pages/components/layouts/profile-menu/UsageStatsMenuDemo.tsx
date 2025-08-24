import { Link } from "react-router";

export const UsageStatsMenuDemo = () => {
    return (
        <div className="dropdown dropdown-bottom sm:dropdown-end max-sm:dropdown-center">
            <div
                tabIndex={0}
                className="avatar bg-base-200 size-12 cursor-pointer overflow-hidden rounded-full px-1 pt-1">
                <img src="/images/avatars/8.png" alt="Avatar" />
            </div>
            <div tabIndex={0} className="dropdown-content bg-base-100 rounded-box mt-2 w-68 shadow">
                <ul className="menu w-full p-2">
                    <li>
                        <Link to="#">
                            <span className="iconify lucide--user size-4.5" />
                            <span>Account</span>
                        </Link>
                    </li>
                    <li>
                        <Link to="#">
                            <span className="iconify lucide--bookmark size-4.5" />
                            <span>Saved Items</span>
                        </Link>
                    </li>
                </ul>

                <hr className="border-base-200" />

                <div className="px-4 py-3">
                    <p className="text-base-content/80 text-sm font-medium">Tool Usage</p>
                    <div className="mt-3 flex items-center gap-2">
                        <span className="iconify lucide--badge-check"></span>
                        <p className="grow text-sm">Current Plan</p>
                        <div className="badge badge-primary badge-sm rounded-full">Pro</div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                        <span className="iconify lucide--gauge"></span>
                        <p className="grow text-sm">Token Limit</p>
                        <span className="text-base-content/70 text-xs font-medium">74 / 2400</span>
                    </div>
                </div>

                <hr className="border-base-200" />

                <div className="px-4 py-3">
                    <p className="text-base-content/80 text-sm font-medium">Image Generator</p>
                    <div className="mt-3 flex items-center gap-2 text-sm">
                        <span className="iconify lucide--image"></span>
                        <p className="grow">Free access active</p>
                        <div className="text-primary flex items-center gap-1 text-xs">
                            <p>Upgrade</p>
                            <span className="iconify lucide--arrow-right size-3.5"></span>
                        </div>
                    </div>
                    <progress
                        className="progress progress-warning mt-2 h-1 w-full align-super"
                        value="74"
                        max="100"></progress>
                    <div className="text-base-content/70 -mt-1 flex justify-between text-xs">
                        <span>20 / 24 images</span>
                        <span>5 days left</span>
                    </div>
                </div>

                <hr className="border-base-200" />

                <ul className="menu w-full p-2">
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
