import { useState } from "react";

export const DrawerNotificationDemo = () => {
    const [step, setStep] = useState(1);

    return (
        <div className="drawer drawer-end">
            <input id="notification-demo-3" type="checkbox" className="drawer-toggle" />
            <div className="drawer-content">
                <label htmlFor="notification-demo-3" className="btn btn-circle btn-soft">
                    <span className="iconify lucide--bell size-5" />
                </label>
            </div>
            <div className="drawer-side">
                <label htmlFor="notification-demo-3" aria-label="close sidebar" className="drawer-overlay"></label>
                <div className="h-full w-72 p-2 sm:w-92">
                    <div className="bg-base-100 rounded-box flex h-full flex-col">
                        <div className="bg-base-200/30 rounded-t-box border-base-200 border-b p-3 pb-0">
                            <div className="flex items-center justify-between gap-3">
                                <label htmlFor="notification-demo-3" className="btn btn-xs btn-circle btn-ghost">
                                    <span className="iconify lucide--arrow-left size-4" />
                                </label>
                                <p className="font-medium">Activity Feed</p>
                                <label htmlFor="notification-demo-3" className="btn btn-xs btn-circle btn-ghost">
                                    <span className="iconify lucide--x size-4" />
                                </label>
                            </div>
                            <div className="-ms-2 mt-1 -mb-px flex items-center justify-between sm:mt-3">
                                <div role="tablist" className="tabs tabs-sm tabs-border">
                                    <div
                                        role="tab"
                                        onClick={() => setStep(1)}
                                        className={`tab gap-2 px-3 ${step === 1 ? "tab-active font-medium" : ""}`}>
                                        <span>All</span>
                                        <div className="badge badge-sm">6</div>
                                    </div>
                                    <div
                                        role="tab"
                                        onClick={() => setStep(2)}
                                        className={`tab gap-2 px-3 ${step === 2 ? "tab-active font-medium" : ""}`}>
                                        <span>Comments</span>
                                    </div>
                                    <div
                                        role="tab"
                                        onClick={() => setStep(3)}
                                        className={`tab gap-2 px-3 ${step === 3 ? "tab-active font-medium" : ""}`}>
                                        <span>Updates</span>
                                    </div>
                                    <div
                                        role="tab"
                                        onClick={() => setStep(4)}
                                        className={`tab gap-2 px-3 max-sm:hidden ${step === 4 ? "tab-active font-medium" : ""}`}>
                                        <span>Tasks</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="divide-base-300 grow divide-y divide-dashed overflow-auto">
                            <div className="hover:bg-base-200/20 relative flex items-start gap-3 p-4 transition-all">
                                <div className="avatar avatar-online w-12 min-w-12">
                                    <img
                                        src="/images/avatars/7.png"
                                        className="mask mask-squircle bg-gradient-to-b from-blue-600/80 to-blue-600/50 px-1 pt-1"
                                        alt=""
                                    />
                                </div>
                                <div className="grow">
                                    <p className="text-sm leading-tight">
                                        <strong>Maria</strong> commented on your task:{" "}
                                        <em>"Refactor billing page layout"</em>.
                                    </p>
                                    <p className="text-base-content/60 text-xs">12 minutes ago</p>
                                    <div className="mt-2 flex items-center gap-2">
                                        <button className="btn btn-sm btn-outline border-base-300">
                                            <span className="iconify lucide--message-square size-4" />
                                            Reply
                                        </button>
                                    </div>
                                </div>
                                <div className="status status-primary absolute end-2 top-2 size-1.5"></div>
                            </div>

                            <div className="hover:bg-base-200/20 flex items-start gap-3 p-4 transition-all">
                                <div className="avatar avatar-offline w-12 min-w-12">
                                    <img
                                        src="/images/avatars/6.png"
                                        className="mask mask-squircle bg-gradient-to-b from-green-500/80 to-green-500/50 px-1 pt-1"
                                        alt=""
                                    />
                                </div>
                                <div className="grow">
                                    <p className="text-sm leading-tight">
                                        Project <strong>"Onboarding v2"</strong> has been marked as completed.
                                    </p>
                                    <p className="text-base-content/60 text-xs">1 hour ago</p>
                                    <div className="mt-2 flex items-center gap-2">
                                        <button className="btn btn-sm btn-soft btn-primary">View Details</button>
                                    </div>
                                </div>
                            </div>

                            <div className="hover:bg-base-200/20 flex items-start gap-3 p-4 transition-all">
                                <div className="avatar w-12 min-w-12">
                                    <img
                                        src="/images/avatars/3.png"
                                        className="mask mask-squircle bg-gradient-to-b from-yellow-600/80 to-yellow-500/60 px-1 pt-1"
                                        alt=""
                                    />
                                </div>
                                <div className="grow">
                                    <p className="text-sm leading-tight">Weekly report is ready for download.</p>
                                    <div className="border-base-200 rounded-box mt-2 flex items-center justify-between gap-2 border px-2.5 py-1.5">
                                        <p className="text-sm">
                                            Usage Report <span className="text-base-content/60 text-xs">(8.2 MB)</span>
                                        </p>
                                        <button className="btn btn-xs btn-square btn-ghost text-xs">
                                            <span className="iconify lucide--download size-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="hover:bg-base-200/20 relative flex items-start gap-3 p-4 transition-all">
                                <div className="avatar w-12 min-w-12">
                                    <img
                                        src="/images/avatars/8.png"
                                        className="mask mask-squircle bg-gradient-to-b from-red-500/80 to-red-400/60 px-1 pt-1"
                                        alt=""
                                    />
                                </div>
                                <div className="grow">
                                    <p className="text-sm leading-tight">
                                        <strong>System alert:</strong> API latency has increased above threshold.
                                    </p>
                                    <p className="text-base-content/60 text-xs">2 hours ago</p>
                                    <div className="mt-2 flex items-center gap-2">
                                        <button className="btn btn-sm btn-outline border-base-300">Investigate</button>
                                    </div>
                                </div>
                                <div className="status status-success absolute end-2 top-2 size-1.5"></div>
                            </div>

                            <div className="hover:bg-base-200/20 flex items-start gap-3 p-4 transition-all">
                                <div className="avatar avatar-online w-12 min-w-12">
                                    <img
                                        src="/images/avatars/1.png"
                                        className="mask mask-squircle bg-gradient-to-b from-purple-500/80 to-purple-400/60 px-1 pt-1"
                                        alt=""
                                    />
                                </div>
                                <div className="grow">
                                    <p className="text-sm leading-tight">
                                        <strong>Alex</strong> assigned you to a new issue:{" "}
                                        <em>"Mobile nav alignment"</em>.
                                    </p>
                                    <p className="text-base-content/60 text-xs">3 hours ago</p>
                                    <div className="mt-2 flex items-center gap-2">
                                        <button className="btn btn-sm btn-soft btn-primary">Open Issue</button>
                                    </div>
                                </div>
                            </div>

                            <div className="hover:bg-base-200/20 flex items-start gap-3 p-4 transition-all">
                                <div className="avatar w-12 min-w-12">
                                    <img
                                        src="/images/avatars/9.png"
                                        className="mask mask-squircle bg-gradient-to-b from-teal-500/80 to-teal-400/60 px-1 pt-1"
                                        alt=""
                                    />
                                </div>
                                <div className="grow">
                                    <p className="text-sm leading-tight">Your password was successfully updated.</p>
                                    <p className="text-base-content/60 text-xs">Yesterday at 7:42 PM</p>
                                </div>
                            </div>
                        </div>

                        <div className="border-base-200 flex items-center justify-between border-t border-dashed p-3">
                            <button className="btn btn-sm btn-outline border-base-300">Open Inbox</button>
                            <div className="flex items-center gap-1">
                                <button className="btn btn-sm btn-square btn-ghost" title="Mark all as read">
                                    <span className="iconify lucide--check size-4" />
                                </button>
                                <button className="btn btn-sm btn-square btn-ghost" title="Notification sound">
                                    <span className="iconify lucide--bell size-4" />
                                </button>
                                <button className="btn btn-sm btn-square btn-ghost" title="Settings">
                                    <span className="iconify lucide--sliders-horizontal size-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
