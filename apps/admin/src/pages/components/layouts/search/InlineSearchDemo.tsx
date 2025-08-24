import { Link } from "react-router";

export const InlineSearchDemo = () => {
    return (
        <div className="dropdown dropdown-bottom dropdown-end">
            <div tabIndex={0} className="input input-sm flex w-56 items-center gap-2 px-2">
                <span className="iconify lucide--search text-base-content/70 size-4" />
                <input
                    type="text"
                    placeholder="Search projects, settings"
                    className="grow bg-transparent text-sm focus:outline-none"
                />
            </div>

            <div tabIndex={0} className="dropdown-content bg-base-100 rounded-box mt-1 w-56 shadow">
                <ul className="menu menu-sm w-full p-1">
                    <li>
                        <p className="menu-title">Search results</p>
                    </li>
                    <li>
                        <Link to="#">
                            <span className="iconify lucide--layout-dashboard size-4" />
                            <span className="text-sm">Dashboard Overview</span>
                        </Link>
                    </li>
                    <li>
                        <Link to="#">
                            <span className="iconify lucide--users size-4" />
                            <span className="text-sm">Team Directory</span>
                        </Link>
                    </li>
                    <li>
                        <Link to="#">
                            <span className="iconify lucide--settings size-4" />
                            <span className="text-sm">Workspace Settings</span>
                        </Link>
                    </li>
                </ul>

                <hr className="border-base-300 my-1 border-dashed" />

                <ul className="menu menu-sm w-full p-1">
                    <li>
                        <p className="menu-title">Recent searches</p>
                    </li>
                    <li>
                        <Link to="#">
                            <span className="iconify lucide--file-text size-4" />
                            <span className="text-sm">Invoice template</span>
                        </Link>
                    </li>
                    <li>
                        <Link to="#">
                            <span className="iconify lucide--folder size-4" />
                            <span className="text-sm">Marketing Q3</span>
                        </Link>
                    </li>
                </ul>
            </div>
        </div>
    );
};
