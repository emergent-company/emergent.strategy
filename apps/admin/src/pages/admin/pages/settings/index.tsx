import React from "react";
import { Link } from "react-router";

import { UserAvatar } from "./UserAvatar";

const SettingsPage = () => {
    return (
        <>
            <div className="min-sm:container">
                <div className="bg-primary/10 rounded-box relative w-full overflow-hidden p-6">
                    <div className="flex justify-between">
                        <div>
                            <div className="flex items-center gap-1">
                                <p className="text-base-content/80 text-sm">Pages</p>
                                <span className="iconify lucide--chevron-right text-base-content/80 size-3.5"></span>
                                <p className="text-sm">Settings</p>
                            </div>
                            <p className="text-primary mt-4 text-xl font-medium">My Profile</p>
                            <p className="text-base-content/80">
                                Configure your preferences and customize your account settings.
                            </p>
                        </div>
                        <div className="flex flex-col items-end justify-between">
                            <button className="btn btn-sm btn-primary max-xl:btn-square">
                                <span className="iconify lucide--settings-2 size-4"></span>
                                <span className="max-xl:hidden">Advanced Setup</span>
                            </button>
                            <div className="text-base-content/60 flex items-center gap-2 max-xl:hidden">
                                <span className="iconify lucide--clock size-4"></span>
                                <p className="text-sm">Changed 6h ago</p>
                            </div>
                        </div>
                    </div>
                    <span className="iconify lucide--settings text-primary/5 absolute start-1/2 -bottom-12 size-44 -rotate-25"></span>
                </div>
                <div className="card bg-base-100 card-border mt-6">
                    <div className="card-body space-y-6 sm:space-y-20 sm:p-8">
                        <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
                            <div className="xl:col-span-2">
                                <div className="flex items-center gap-2">
                                    <span className="iconify lucide--id-card size-5" />
                                    <p className="text-lg font-medium">User Profile</p>
                                </div>
                                <p className="text-base-content/60">Manage your account information and settings</p>
                            </div>
                            <div className="flex gap-5 max-lg:flex-col xl:col-span-3">
                                <UserAvatar />
                                <div className="fieldset grid grow grid-cols-1 gap-5 lg:grid-cols-2">
                                    <div className="space-y-2">
                                        <label className="fieldset-label" htmlFor="name">
                                            Full Name
                                        </label>
                                        <label className="input w-full">
                                            <span className="iconify lucide--user text-base-content/60 size-4.5"></span>
                                            <input
                                                type="text"
                                                className="grow"
                                                placeholder="Name"
                                                id="name"
                                                defaultValue="Denish Navadiya"
                                            />
                                        </label>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="fieldset-label">User</label>
                                        <label className="input w-full">
                                            <span className="label">nexus.com/</span>
                                            <input placeholder="username" type="text" defaultValue="withden" />
                                        </label>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="fieldset-label" htmlFor="email">
                                            Email
                                        </label>
                                        <label className="input w-full">
                                            <span className="iconify lucide--mail text-base-content/60 size-4.5"></span>
                                            <input
                                                type="text"
                                                className="grow"
                                                placeholder="Email"
                                                id="email"
                                                defaultValue="test@gmail.com"
                                            />
                                        </label>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="fieldset-label" htmlFor="mobile">
                                            Mobile
                                        </label>
                                        <label className="input w-full">
                                            <span className="iconify lucide--phone text-base-content/60 size-4.5"></span>
                                            <input
                                                type="text"
                                                className="grow"
                                                placeholder="Mobile"
                                                id="mobile"
                                                defaultValue="(+123) 9876543210"
                                            />
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
                            <div className="xl:col-span-2">
                                <div className="flex items-center gap-2">
                                    <span className="iconify lucide--bell size-5" />
                                    <p className="text-lg font-medium">Notifications</p>
                                </div>
                                <p className="text-base-content/60">
                                    Manage your notification settings and preferences
                                </p>
                            </div>
                            <div className="gap-5 xl:col-span-3">
                                <div className="fieldset grid grid-cols-1 gap-5 lg:grid-cols-3">
                                    <div className="space-y-2">
                                        <label className="fieldset-label" htmlFor="notification-channel">
                                            Channel
                                        </label>
                                        <select
                                            className="select w-full"
                                            defaultValue="in-app"
                                            aria-label="Notification Channel"
                                            id="notification-channel">
                                            <option value="email">Email</option>
                                            <option value="in-app">In App</option>
                                            <option value="sms">SMS</option>
                                            <option value="none">None</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="fieldset-label" htmlFor="notification-new-order">
                                            Notify on new order
                                        </label>
                                        <select
                                            className="select w-full"
                                            defaultValue="important"
                                            aria-label="New Order"
                                            id="notification-new-order">
                                            <option value="all">All</option>
                                            <option value="important">Important</option>
                                            <option value="mention">only @mention</option>
                                            <option value="none">None</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="fieldset-label" htmlFor="notification-activity">
                                            Activity Updates
                                        </label>
                                        <select
                                            className="select w-full"
                                            defaultValue="mention"
                                            aria-label="Activity Updates"
                                            id="notification-activity">
                                            <option value="all-activity">All Activity</option>
                                            <option value="important-activity">Important Activity Only</option>
                                            <option value="mention">Only @mention</option>
                                            <option value="none">No Notifications</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
                            <div className="xl:col-span-2">
                                <div className="flex items-center gap-2">
                                    <span className="iconify lucide--calendar-cog size-5" />
                                    <p className="text-lg font-medium">Time Preferences</p>
                                </div>
                                <p className="text-base-content/60">Set your timezone and time format</p>
                            </div>
                            <div className="gap-5 xl:col-span-3">
                                <div className="fieldset grid grid-cols-1 gap-5 lg:grid-cols-3">
                                    <div className="space-y-2">
                                        <label className="fieldset-label" htmlFor="timezone">
                                            Timezone
                                        </label>
                                        <select
                                            className="select w-full"
                                            defaultValue="asia-kolkata"
                                            aria-label="Timezone"
                                            id="timezone">
                                            <option value="america-toronto">GMT-5:00 – Toronto (EST)</option>
                                            <option value="america-chicago">GMT-6:00 – Chicago(CST)</option>
                                            <option value="america-denver">GMT-7:00 – Calgary (MST)</option>
                                            <option value="america-losangeles">GMT-8:00 – Vancouver (PST)</option>
                                            <option value="asia-kolkata">GMT+5:30 – Mumbai (IST)</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="fieldset-label" htmlFor="datetime-format">
                                            Datetime Format
                                        </label>
                                        <select
                                            className="select w-full"
                                            defaultValue="12-hour"
                                            aria-label="Time & Date Format"
                                            id="datetime-format">
                                            <option value="12-hour">12-hour (AM/PM)</option>
                                            <option value="24-hour">24-hour</option>
                                            <option value="dd-mm-yyyy">DD/MM/YYYY</option>
                                            <option value="mm-dd-yyyy">MM/DD/YYYY</option>
                                            <option value="yyyy-mm-dd">YYYY/MM/DD</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="fieldset-label" htmlFor="datetime-first-day">
                                            First day of week
                                        </label>
                                        <select
                                            className="select w-full"
                                            defaultValue="sunday"
                                            aria-label="First day of week"
                                            id="datetime-first-day">
                                            <option value="sunday">Sunday</option>
                                            <option value="monday">Monday</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-6 flex justify-between gap-4 max-sm:flex-col-reverse">
                    <div className="text-sm">
                        <p>You might looking for:</p>
                        <ul className="text-base-content/80 mt-2">
                            <li className="link link-hover">Manage users</li>
                            <li className="link link-hover">Security & roles</li>
                            <li className="link link-hover">Payment preference</li>
                        </ul>
                    </div>
                    <div className="flex justify-end gap-3">
                        <Link className="btn btn-sm btn-ghost" to="#">
                            <span className="iconify lucide--x size-4" />
                            Cancel
                        </Link>
                        <Link className="btn btn-sm btn-primary" to="#">
                            <span className="iconify lucide--arrow-up-from-line size-4" />
                            Update
                        </Link>
                    </div>
                </div>
            </div>
        </>
    );
};

export default SettingsPage;
