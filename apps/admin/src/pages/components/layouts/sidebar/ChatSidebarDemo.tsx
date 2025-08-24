import { Link } from "react-router";

export const ChatSidebarDemo = () => {
    return (
        <div className="sidebar-menu relative flex h-full w-full flex-col py-3">
            <label
                htmlFor="layout-sidebar-hover-trigger"
                title="Toggle sidebar hover"
                className="btn btn-circle btn-ghost btn-sm text-base-content/50 absolute end-2 top-3.5 max-lg:hidden">
                <span className="iconify lucide--panel-left-close absolute size-4.5 opacity-100 transition-all duration-300 group-has-[[id=layout-sidebar-hover-trigger]:checked]/html:opacity-0" />
                <span className="iconify lucide--panel-left-dashed absolute size-4.5 opacity-0 transition-all duration-300 group-has-[[id=layout-sidebar-hover-trigger]:checked]/html:opacity-100" />
            </label>
            <div className="flex min-h-10 items-center gap-3 px-5">
                <span className="text-xl font-semibold">ACME Inc</span>
                <hr className="border-base-300 h-5 border-e" />
                <span className="text-base-content/50 font-medium">AI Agent</span>
            </div>

            <div className="mt-2 flex items-center gap-2.5 px-2.5">
                <label className="input h-9 grow px-2.5">
                    <span className="iconify lucide--search text-base-content/80 min-h-4 min-w-4"></span>
                    <input className="grow" placeholder="Search" type="search" />
                    <kbd className="kbd kbd-sm">K</kbd>
                </label>
                <button className="btn btn-primary btn-square size-9" aria-label="New Chat">
                    <span className="iconify lucide--plus size-5"></span>
                </button>
            </div>

            <div className="custom-scrollbar mt-2.5 grow space-y-2.5 overflow-auto px-2.5">
                <div className="rounded-box border-base-200 hover:bg-base-200/40 hover:border-base-300 flex cursor-pointer items-start gap-2 border px-2.5 py-1.5 transition-all">
                    <span className="iconify lucide--bot text-base-content/80 mt-px min-w-4"></span>
                    <div className="grow">
                        <p className="text-sm/none font-medium">AI Chat Assistant</p>
                        <p className="text-base-content/60 line-clamp-1 text-xs">How can I help you today?</p>
                    </div>
                    <span className="text-base-content/40 text-xs whitespace-nowrap">2 min</span>
                </div>

                <div className="rounded-box border-base-200 hover:bg-base-200/40 hover:border-base-300 flex cursor-pointer items-start gap-2 border px-2.5 py-1.5 transition-all">
                    <span className="iconify lucide--bar-chart-3 text-base-content/80 mt-px min-w-4"></span>
                    <div className="grow">
                        <p className="text-sm/none font-medium">Marketing Bot</p>
                        <p className="text-base-content/60 line-clamp-1 text-xs">Here’s your weekly report</p>
                    </div>
                    <span className="text-base-content/40 text-xs whitespace-nowrap">10 min</span>
                </div>

                <div className="rounded-box border-base-200 hover:bg-base-200/40 hover:border-base-300 flex cursor-pointer items-start gap-2 border px-2.5 py-1.5 transition-all">
                    <span className="iconify lucide--life-buoy text-base-content/80 mt-px min-w-4"></span>
                    <div className="grow">
                        <p className="text-sm/none font-medium">Support Chat</p>
                        <p className="text-base-content/60 line-clamp-1 text-xs">Your ticket has been updated</p>
                    </div>
                    <span className="text-base-content/40 text-xs whitespace-nowrap">25 min</span>
                </div>

                <div className="rounded-box border-base-200 hover:bg-base-200/40 hover:border-base-300 flex cursor-pointer items-start gap-2 border px-2.5 py-1.5 transition-all">
                    <span className="iconify lucide--users text-base-content/80 mt-px min-w-4"></span>
                    <div className="grow">
                        <p className="text-sm/none font-medium">Team Workspace</p>
                        <p className="text-base-content/60 line-clamp-1 text-xs">New updates on project X</p>
                    </div>
                    <span className="text-base-content/40 text-xs whitespace-nowrap">1 hr</span>
                </div>

                <div className="rounded-box border-base-200 hover:bg-base-200/40 hover:border-base-300 flex cursor-pointer items-start gap-2 border px-2.5 py-1.5 transition-all">
                    <span className="iconify lucide--bell text-base-content/80 mt-px min-w-4"></span>
                    <div className="grow">
                        <p className="text-sm/none font-medium">Notifications</p>
                        <p className="text-base-content/60 line-clamp-1 text-xs">You have 3 unread alerts</p>
                    </div>
                    <span className="text-base-content/40 text-xs whitespace-nowrap">3 hr</span>
                </div>

                <button className="btn btn-outline btn-block border-base-200 h-9">
                    <span className="iconify lucide--book-text text-base-content/80"></span>
                    Show All
                    <span className="iconify lucide--chevron-down text-base-content/80"></span>
                </button>
            </div>
            <div className="mt-8"></div>
            <div className="mt-2 space-y-0.5 px-2.5">
                <Link to="#" className="menu-item group">
                    <span className="iconify lucide--home size-4"></span>
                    <p className="grow">Home</p>
                </Link>
                <Link to="#" className="menu-item group">
                    <span className="iconify lucide--star size-4"></span>
                    <p className="grow">Favorite</p>
                </Link>
                <Link to="#" className="menu-item group">
                    <span className="iconify lucide--settings-2 size-4"></span>
                    <p className="grow">Settings</p>
                </Link>
            </div>
            <div className="border-base-200 rounded-box mx-2.5 mt-2 border px-2.5 py-2.5">
                <div className="bg-base-200 rounded-box inline-flex items-center justify-center p-1.5">
                    <span className="iconify lucide--layers-2 size-4"></span>
                </div>
                <div className="mt-5 flex items-center justify-between">
                    <p className="text-sm font-medium">Basic</p>
                    <span className="text-base-content/80 text-xs">84%</span>
                </div>
                <progress max="2000" value="1600" className="progress progress-warning h-1.5 align-super"></progress>
                <div className="-mt-2 flex items-center justify-between">
                    <span className="text-sm font-medium">320 left</span>
                    <span className="text-base-content/80 text-xs">2K Tokens</span>
                </div>
                <button className="btn btn-outline btn-block border-base-300 mt-3 h-9">
                    <span className="iconify lucide--zap text-base-content/80"></span>
                    Upgrade
                </button>
            </div>
        </div>
    );
};
