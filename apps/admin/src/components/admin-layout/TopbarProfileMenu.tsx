import React from "react";
import { Link } from "react-router";

export const TopbarProfileMenu = () => {
    return (
        <div className="dropdown-bottom ms-1 dropdown dropdown-end">
            <div tabIndex={0} className="cursor-pointer">
                <div className="bg-base-200 rounded-full ring ring-success size-7 overflow-hidden avatar">
                    <img src="/images/avatars/1.png" alt="Avatar" />
                </div>
            </div>
            <div tabIndex={0} className="bg-base-100 shadow mt-2 rounded-box w-44 dropdown-content">
                <ul className="p-2 w-full menu">
                    <li>
                        <Link to="#">
                            <span className="size-4 iconify lucide--user" />
                            <span>My Profile</span>
                        </Link>
                    </li>
                    <li>
                        <Link to="#">
                            <span className="size-4 iconify lucide--settings" />
                            <span>Settings</span>
                        </Link>
                    </li>
                    <li>
                        <Link to="#">
                            <span className="size-4 iconify lucide--help-circle" />
                            <span>Help</span>
                        </Link>
                    </li>
                </ul>
                <hr className="border-base-300" />
                <ul className="p-2 w-full menu">
                    <li>
                        <div>
                            <span className="lucide--arrow-left-right size-4 iconify" />
                            <span>Switch Account</span>
                        </div>
                    </li>
                    <li>
                        <Link className="hover:bg-error/10 text-error" to="#">
                            <span className="size-4 iconify lucide--log-out" />
                            <span>Logout</span>
                        </Link>
                    </li>
                </ul>
            </div>
        </div>
    );
};
