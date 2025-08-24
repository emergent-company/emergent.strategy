import React from "react";
import { Link } from "react-router";

export const TopbarProfileMenu = () => {
    return (
        <div>
            <div className="drawer drawer-end">
                <input id="topbar-profile-drawer" type="checkbox" className="drawer-toggle" />
                <div className="drawer-content">
                    <label htmlFor="topbar-profile-drawer" className="btn btn-ghost max-sm:btn-square gap-2 px-1.5">
                        <div className="avatar">
                            <div className="bg-base-200 mask mask-squircle w-8">
                                <img src="/images/avatars/1.png" alt="Avatar" />
                            </div>
                        </div>
                        <div className="text-start max-sm:hidden">
                            <p className="text-sm/none">Denish</p>
                            <p className="text-base-content/50 mt-0.5 text-xs/none">Team</p>
                        </div>
                    </label>
                </div>
                <div className="drawer-side">
                    <label
                        htmlFor="topbar-profile-drawer"
                        aria-label="close sidebar"
                        className="drawer-overlay"></label>
                    <div className="h-full w-72 p-2 sm:w-84">
                        <div className="bg-base-100 rounded-box relative flex h-full flex-col pt-4 sm:pt-8">
                            <label
                                htmlFor="topbar-profile-drawer"
                                className="btn btn-xs btn-circle btn-ghost absolute start-2 top-2"
                                aria-label="Close">
                                <span className="iconify lucide--x size-4" />
                            </label>

                            <div className="flex flex-col items-center">
                                <div className="relative">
                                    <div className="avatar bg-base-200 isolate size-20 cursor-pointer overflow-hidden rounded-full px-1 pt-1 md:size-24">
                                        <img src="/images/avatars/1.png" alt="User Avatar" />
                                    </div>
                                    <div className="bg-base-100 absolute end-0 bottom-0 flex items-center justify-center rounded-full p-1.5 shadow-sm">
                                        <span className="iconify lucide--pencil size-4" />
                                    </div>
                                </div>

                                <p className="mt-4 text-lg/none font-medium sm:mt-8">John Doe</p>
                                <p className="text-base-content/60 mt-1 text-sm">john@company.com</p>

                                <div className="mt-4 flex items-center gap-2 *:cursor-pointer sm:mt-6">
                                    <div className="avatar bg-base-200 size-10 overflow-hidden rounded-full px-1 pt-1">
                                        <img src="/images/avatars/2.png" alt="Team member" />
                                    </div>
                                    <div className="avatar bg-base-200 size-10 overflow-hidden rounded-full px-1 pt-1">
                                        <img src="/images/avatars/3.png" alt="Team member" />
                                    </div>
                                    <div className="avatar bg-base-200 size-10 overflow-hidden rounded-full px-1 pt-1">
                                        <img src="/images/avatars/4.png" alt="Team member" />
                                    </div>
                                    <div className="bg-base-200 border-base-300 flex size-10 items-center justify-center rounded-full border border-dashed">
                                        <span className="iconify lucide--plus size-4.5" />
                                    </div>
                                </div>
                            </div>

                            <div className="border-base-300 mt-4 grow overflow-auto border-t border-dashed px-2 sm:mt-6">
                                <ul className="menu w-full p-2">
                                    <li className="menu-title">Account</li>
                                    <li>
                                        <Link to="#">
                                            <span className="iconify lucide--user size-4.5" />
                                            <span>View Profile</span>
                                        </Link>
                                    </li>
                                    <li>
                                        <Link to="#">
                                            <span className="iconify lucide--users size-4.5" />
                                            <span>Team</span>
                                        </Link>
                                    </li>
                                    <li>
                                        <Link to="#">
                                            <span className="iconify lucide--mail-plus size-4.5" />
                                            <span>Invites</span>
                                            <div className="badge badge-sm">4</div>
                                        </Link>
                                    </li>

                                    <li className="menu-title">Platform</li>
                                    <li>
                                        <Link to="#">
                                            <span className="iconify lucide--settings size-4.5" />
                                            <span>Settings</span>
                                        </Link>
                                    </li>
                                    <li>
                                        <Link to="#">
                                            <span className="iconify lucide--credit-card size-4.5" />
                                            <span>Billing</span>
                                        </Link>
                                    </li>
                                    <li>
                                        <Link to="#">
                                            <span className="iconify lucide--help-circle size-4.5" />
                                            <span>Support</span>
                                        </Link>
                                    </li>

                                    <li>
                                        <Link className="text-error hover:bg-error/10" to="#">
                                            <span className="iconify lucide--log-out size-4.5" />
                                            <span>Sign Out</span>
                                        </Link>
                                    </li>
                                </ul>
                            </div>

                            <div className="rounded-box from-primary to-secondary text-primary-content m-4 mt-auto flex cursor-pointer flex-col items-center justify-center bg-linear-to-br p-4 text-center transition-all hover:opacity-95 sm:p-6">
                                <div className="bg-primary-content/10 border-primary-content/10 flex items-center justify-center rounded-full border p-1.5 sm:p-2.5">
                                    <span className="iconify lucide--zap size-5 sm:size-6" />
                                </div>
                                <p className="mt-2 font-mono text-[11px] font-medium tracking-wider uppercase opacity-70 sm:mt-4">
                                    Upgrade your plan
                                </p>
                                <p className="mt-1 leading-none font-medium sm:text-lg">
                                    Save <span className="font-semibold underline">30%</span> today
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
