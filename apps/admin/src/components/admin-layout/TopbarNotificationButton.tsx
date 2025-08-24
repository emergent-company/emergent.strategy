import React, { useState } from "react";

export const TopbarNotificationButton = () => {
    const [step, setStep] = useState(1);

    const closeMenu = () => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    };

    return (
        <div className="dropdown dropdown-bottom sm:dropdown-end dropdown-center">
            <div
                tabIndex={0}
                role="button"
                className="btn btn-circle btn-ghost btn-sm relative"
                aria-label="Notifications">
                <span className="iconify lucide--bell motion-preset-seesaw size-4.5" />
                <div className="status status-error status-sm absolute end-1 top-1"></div>
            </div>
            <div
                tabIndex={0}
                className="dropdown-content bg-base-100 rounded-box mt-1 w-84 shadow-md duration-1000 hover:shadow-lg">
                <div className="bg-base-200/30 rounded-t-box border-base-200 border-b ps-4 pe-2 pt-3">
                    <div className="flex items-center justify-between">
                        <p className="font-medium">Notification</p>
                        <button className="btn btn-xs btn-circle btn-ghost" aria-label="Close" onClick={closeMenu}>
                            <span className="iconify lucide--x size-4" />
                        </button>
                    </div>
                    <div className="-ms-2 mt-2 -mb-px flex items-center justify-between">
                        <div role="tablist" className="tabs tabs-sm tabs-border">
                            <div
                                role="tab"
                                onClick={() => setStep(1)}
                                className={`tab gap-2 px-3 ${step == 1 ? "tab-active font-medium" : ""}`}>
                                <span>All</span>
                                <div className="badge badge-sm">4</div>
                            </div>
                            <div
                                role="tab"
                                onClick={() => setStep(2)}
                                className={`tab gap-2 px-3 ${step == 2 ? "tab-active font-medium" : ""}`}>
                                <span>Team</span>
                            </div>
                            <div
                                role="tab"
                                onClick={() => setStep(3)}
                                className={`tab gap-2 px-3 ${step == 3 ? "tab-active font-medium" : ""}`}>
                                <span>AI</span>
                            </div>
                            <div
                                role="tab"
                                onClick={() => setStep(4)}
                                className={`tab gap-2 px-3 ${step == 4 ? "tab-active font-medium" : ""}`}>
                                <span>@mention</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="hover:bg-base-200/20 relative flex items-start gap-3 p-4 transition-all">
                    <div className="avatar avatar-online size-12">
                        <img
                            src="/images/avatars/2.png"
                            className="from-primary/80 to-primary/60 mask mask-squircle bg-linear-to-b px-1 pt-1"
                            alt=""
                        />
                    </div>

                    <div className="grow">
                        <p className="text-sm leading-tight">Lena submitted a draft for review.</p>
                        <p className="text-base-content/60 text-xs">15 min ago</p>
                        <div className="mt-2 flex items-center gap-2">
                            <button className="btn btn-sm btn-primary">Approve</button>
                            <button className="btn btn-sm btn-outline border-base-300">Decline</button>
                        </div>
                    </div>
                    <div className="status status-primary absolute end-4 top-4 size-1.5"></div>
                </div>
                <hr className="border-base-300 border-dashed" />
                <div className="hover:bg-base-200/20 flex items-start gap-3 p-4 transition-all">
                    <div className="avatar avatar-offline size-12">
                        <img
                            src="/images/avatars/4.png"
                            className="from-secondary/80 to-secondary/60 mask mask-squircle bg-linear-to-b px-1 pt-1"
                            alt=""
                        />
                    </div>
                    <div className="grow">
                        <p className="text-sm leading-tight">Kai mentioned you in a project.</p>
                        <p className="text-base-content/60 text-xs">22 min ago</p>
                        <div className="from-base-200 via-base-200/80 rounded-box mt-2 flex items-center justify-between gap-2 bg-linear-to-r to-transparent py-1 ps-2.5">
                            <p className="text-sm">Check model inputs?</p>
                            <button className="btn btn-xs btn-ghost text-xs">
                                <span className="iconify lucide--reply size-3.5" />
                                Reply
                            </button>
                        </div>
                    </div>
                </div>
                <hr className="border-base-300 border-dashed" />
                <div className="hover:bg-base-200/20 flex items-start gap-3 p-4 transition-all">
                    <div className="avatar size-12">
                        <img
                            src="/images/avatars/5.png"
                            className="mask mask-squircle bg-linear-to-b from-orange-500/80 to-orange-500/60 px-1 pt-1"
                            alt=""
                        />
                    </div>
                    <div className="grow">
                        <p className="text-sm leading-tight">Your latest results are ready</p>
                        <div className="border-base-200 rounded-box mt-2 flex items-center justify-between gap-2 border px-2.5 py-1.5">
                            <p className="text-sm">
                                Forecast Report <span className="text-base-content/60 text-xs">(12 MB)</span>
                            </p>
                            <button className="btn btn-xs btn-square btn-ghost text-xs">
                                <span className="iconify lucide--arrow-down-to-line size-4" />
                            </button>
                        </div>
                        <div className="border-base-200 rounded-box mt-2 flex items-center justify-between gap-2 border px-2.5 py-1.5">
                            <p className="text-sm">
                                Generated Summary <span className="text-base-content/60 text-xs">(354 KB)</span>
                            </p>
                            <button className="btn btn-xs btn-square btn-ghost text-xs">
                                <span className="iconify lucide--arrow-down-to-line size-4" />
                            </button>
                        </div>
                    </div>
                </div>
                <hr className="border-base-200" />
                <div className="flex items-center justify-between px-2 py-2">
                    <button className="btn btn-sm btn-soft btn-primary">View All</button>

                    <div className="flex items-center gap-1">
                        <button className="btn btn-sm btn-square btn-ghost">
                            <span className="iconify lucide--check-check size-4" />
                        </button>
                        <button className="btn btn-sm btn-square btn-ghost">
                            <span className="iconify lucide--bell-ring size-4" />
                        </button>
                        <button className="btn btn-sm btn-square btn-ghost">
                            <span className="iconify lucide--settings size-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
