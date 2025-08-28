import React from "react";
import { Link } from "react-router";

export const TopbarProfileMenu = () => {
    return (
        <div>
            <div className="drawer drawer-end">
                <input id="topbar-profile-drawer" type="checkbox" className="drawer-toggle" />
                <div className="drawer-content">
                    <label htmlFor="topbar-profile-drawer" className="gap-2 px-1.5 btn btn-ghost max-sm:btn-square">
                        <div className="avatar">
                            <div className="bg-base-200 w-8 mask mask-squircle">
                                <img src="/images/avatars/1.png" alt="Avatar" />
                            </div>
                        </div>
                        <div className="max-sm:hidden text-start">
                            <p className="text-sm/none">Denish</p>
                            <p className="mt-0.5 text-xs/none text-base-content/50">Team</p>
                        </div>
                    </label>
                </div>
                <div className="drawer-side">
                    <label
                        htmlFor="topbar-profile-drawer"
                        aria-label="close sidebar"
                        className="drawer-overlay"></label>
                    <div className="p-2 w-72 sm:w-84 h-full">
                        <div className="relative flex flex-col bg-base-100 pt-4 sm:pt-8 rounded-box h-full">
                            <label
                                htmlFor="topbar-profile-drawer"
                                className="top-2 absolute btn btn-xs btn-circle btn-ghost start-2"
                                aria-label="Close">
                                <span className="size-4 iconify lucide--x" />
                            </label>

                            <div className="flex flex-col items-center">
                                <div className="relative">
                                    <div className="isolate bg-base-200 px-1 pt-1 rounded-full size-20 md:size-24 overflow-hidden cursor-pointer avatar">
                                        <img src="/images/avatars/1.png" alt="User Avatar" />
                                    </div>
                                    <div className="bottom-0 absolute flex justify-center items-center bg-base-100 shadow-sm p-1.5 rounded-full end-0">
                                        <span className="size-4 iconify lucide--pencil" />
                                    </div>
                                </div>

                                <p className="mt-4 sm:mt-8 font-medium text-lg/none">John Doe</p>
                                <p className="mt-1 text-sm text-base-content/60">john@company.com</p>

                                <div className="flex items-center gap-2 mt-4 sm:mt-6 *:cursor-pointer">
                                    <div className="bg-base-200 px-1 pt-1 rounded-full size-10 overflow-hidden avatar">
                                        <img src="/images/avatars/2.png" alt="Team member" />
                                    </div>
                                    <div className="bg-base-200 px-1 pt-1 rounded-full size-10 overflow-hidden avatar">
                                        <img src="/images/avatars/3.png" alt="Team member" />
                                    </div>
                                    <div className="bg-base-200 px-1 pt-1 rounded-full size-10 overflow-hidden avatar">
                                        <img src="/images/avatars/4.png" alt="Team member" />
                                    </div>
                                    <div className="flex justify-center items-center bg-base-200 border border-base-300 border-dashed rounded-full size-10">
                                        <span className="size-4.5 iconify lucide--plus" />
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 sm:mt-6 px-2 border-t border-base-300 border-dashed overflow-auto grow">
                                <ul className="p-2 w-full menu">
                                    <li className="menu-title">Account</li>
                                    <li>
                                        <Link to="/admin/profile">
                                            <span className="size-4.5 iconify lucide--user" />
                                            <span>View Profile</span>
                                        </Link>
                                    </li>
                                    <li>
                                        <Link to="#">
                                            <span className="size-4.5 iconify lucide--users" />
                                            <span>Team</span>
                                        </Link>
                                    </li>
                                    <li>
                                        <Link to="#">
                                            <span className="size-4.5 iconify lucide--mail-plus" />
                                            <span>Invites</span>
                                            <div className="badge badge-sm">4</div>
                                        </Link>
                                    </li>

                                    <li className="menu-title">Platform</li>
                                    <li>
                                        <Link to="/admin/settings/ai/prompts">
                                            <span className="size-4.5 iconify lucide--settings" />
                                            <span>Settings</span>
                                        </Link>
                                    </li>
                                    <li>
                                        <Link to="#">
                                            <span className="size-4.5 iconify lucide--credit-card" />
                                            <span>Billing</span>
                                        </Link>
                                    </li>
                                    <li>
                                        <Link to="#">
                                            <span className="size-4.5 iconify lucide--help-circle" />
                                            <span>Support</span>
                                        </Link>
                                    </li>

                                    <li>
                                        <Link className="hover:bg-error/10 text-error" to="#">
                                            <span className="size-4.5 iconify lucide--log-out" />
                                            <span>Sign Out</span>
                                        </Link>
                                    </li>
                                </ul>
                            </div>

                            <div className="flex flex-col justify-center items-center bg-linear-to-br from-primary to-secondary hover:opacity-95 m-4 mt-auto p-4 sm:p-6 rounded-box text-primary-content text-center transition-all cursor-pointer">
                                <div className="flex justify-center items-center bg-primary-content/10 p-1.5 sm:p-2.5 border border-primary-content/10 rounded-full">
                                    <span className="size-5 sm:size-6 iconify lucide--zap" />
                                </div>
                                <p className="opacity-70 mt-2 sm:mt-4 font-mono font-medium text-[11px] uppercase tracking-wider">
                                    Upgrade your plan
                                </p>
                                <p className="mt-1 font-medium sm:text-lg leading-none">
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
