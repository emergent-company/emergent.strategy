import React, { useState } from "react";
import { Icon } from "@/components/ui/Icon";

export const TopbarNotificationButton = () => {
    const [step, setStep] = useState(1);

    const closeMenu = () => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    };

    return (
        <div className="dropdown-bottom dropdown sm:dropdown-end dropdown-center">
            <div
                tabIndex={0}
                role="button"
                className="relative btn btn-circle btn-ghost btn-sm"
                aria-label="Notifications">
                <Icon icon="lucide--bell" className="size-4.5 motion-preset-seesaw" />
                <div className="top-1 absolute status status-error status-sm end-1"></div>
            </div>
            <div
                tabIndex={0}
                className="bg-base-100 shadow-md hover:shadow-lg mt-1 rounded-box w-84 duration-1000 dropdown-content">
                <div className="bg-base-200/30 ps-4 pe-2 pt-3 border-b border-base-200 rounded-t-box">
                    <div className="flex justify-between items-center">
                        <p className="font-medium">Notification</p>
                        <button className="btn btn-xs btn-circle btn-ghost" aria-label="Close" onClick={closeMenu}>
                            <Icon icon="lucide--x" className="size-4" />
                        </button>
                    </div>
                    <div className="flex justify-between items-center -ms-2 mt-2 -mb-px">
                        <div role="tablist" className="tabs-border tabs tabs-sm">
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
                <div className="relative flex items-start gap-3 hover:bg-base-200/20 p-4 transition-all">
                    <div className="size-12 avatar avatar-online">
                        <img
                            src="/images/avatars/2.png"
                            className="bg-linear-to-b from-primary/80 to-primary/60 px-1 pt-1 mask mask-squircle"
                            alt=""
                        />
                    </div>

                    <div className="grow">
                        <p className="text-sm leading-tight">Lena submitted a draft for review.</p>
                        <p className="text-xs text-base-content/60">15 min ago</p>
                        <div className="flex items-center gap-2 mt-2">
                            <button className="btn btn-sm btn-primary">Approve</button>
                            <button className="border-base-300 btn-outline btn btn-sm">Decline</button>
                        </div>
                    </div>
                    <div className="top-4 absolute size-1.5 status status-primary end-4"></div>
                </div>
                <hr className="border-base-300 border-dashed" />
                <div className="flex items-start gap-3 hover:bg-base-200/20 p-4 transition-all">
                    <div className="size-12 avatar avatar-offline">
                        <img
                            src="/images/avatars/4.png"
                            className="bg-linear-to-b from-secondary/80 to-secondary/60 px-1 pt-1 mask mask-squircle"
                            alt=""
                        />
                    </div>
                    <div className="grow">
                        <p className="text-sm leading-tight">Kai mentioned you in a project.</p>
                        <p className="text-xs text-base-content/60">22 min ago</p>
                        <div className="flex justify-between items-center gap-2 bg-linear-to-r from-base-200 via-base-200/80 to-transparent mt-2 py-1 ps-2.5 rounded-box">
                            <p className="text-sm">Check model inputs?</p>
                            <button className="text-xs btn btn-xs btn-ghost">
                                <Icon icon="lucide--reply" className="size-3.5" />
                                Reply
                            </button>
                        </div>
                    </div>
                </div>
                <hr className="border-base-300 border-dashed" />
                <div className="flex items-start gap-3 hover:bg-base-200/20 p-4 transition-all">
                    <div className="size-12 avatar">
                        <img
                            src="/images/avatars/5.png"
                            className="bg-linear-to-b from-orange-500/80 to-orange-500/60 px-1 pt-1 mask mask-squircle"
                            alt=""
                        />
                    </div>
                    <div className="grow">
                        <p className="text-sm leading-tight">Your latest results are ready</p>
                        <div className="flex justify-between items-center gap-2 mt-2 px-2.5 py-1.5 border border-base-200 rounded-box">
                            <p className="text-sm">
                                Forecast Report <span className="text-xs text-base-content/60">(12 MB)</span>
                            </p>
                            <button className="text-xs btn btn-xs btn-square btn-ghost">
                                <Icon icon="lucide--arrow-down-to-line" className="size-4" />
                            </button>
                        </div>
                        <div className="flex justify-between items-center gap-2 mt-2 px-2.5 py-1.5 border border-base-200 rounded-box">
                            <p className="text-sm">
                                Generated Summary <span className="text-xs text-base-content/60">(354 KB)</span>
                            </p>
                            <button className="text-xs btn btn-xs btn-square btn-ghost">
                                <Icon icon="lucide--arrow-down-to-line" className="size-4" />
                            </button>
                        </div>
                    </div>
                </div>
                <hr className="border-base-200" />
                <div className="flex justify-between items-center px-2 py-2">
                    <button className="btn btn-sm btn-soft btn-primary">View All</button>

                    <div className="flex items-center gap-1">
                        <button className="btn btn-sm btn-square btn-ghost">
                            <Icon icon="lucide--check-check" className="size-4" />
                        </button>
                        <button className="btn btn-sm btn-square btn-ghost">
                            <Icon icon="lucide--bell-ring" className="size-4" />
                        </button>
                        <button className="btn btn-sm btn-square btn-ghost">
                            <Icon icon="lucide--settings" className="size-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
