import { ModalUsagesChart } from "./ModalUsagesChart";

export const ModalOverview = () => {
    return (
        <div className="card bg-base-100 shadow">
            <div className="card-body px-0 pb-0">
                <div className="px-6">
                    <div className="flex items-start justify-between">
                        <span className="text-lg/none font-medium">Modals Overview</span>
                        <div className="flex items-center gap-1.5">
                            <button className="btn btn-circle btn-sm border-base-300 btn-outline">
                                <span className="iconify lucide--arrow-up-down size-4"></span>
                            </button>
                            <button className="btn btn-circle btn-sm border-base-300 btn-outline">
                                <span className="iconify lucide--layout-grid size-4"></span>
                            </button>
                            <button className="btn btn-circle btn-sm border-base-300 btn-outline max-sm:hidden">
                                <span className="iconify lucide--refresh-cw size-4"></span>
                            </button>
                        </div>
                    </div>
                    <div className="mt-1 flex justify-between">
                        <div>
                            <div className="flex items-center gap-3">
                                <span className="text-4xl font-semibold">627K</span>
                                <span className="text-primary font-medium">+2.14%</span>
                            </div>
                            <span className="text-base-content/60 text-sm">Tokens processed today</span>
                        </div>
                        <div className="dropdown dropdown-end mt-1">
                            <div
                                tabIndex={0}
                                role="button"
                                className="text-base-content/60 hover:text-base-content flex cursor-pointer items-center gap-1 text-sm transition-all">
                                This Month
                                <span className="iconify lucide--chevron-down size-3"></span>
                            </div>
                            <ul
                                tabIndex={0}
                                className="dropdown-content menu bg-base-100 rounded-box z-1 mt-1 w-36 p-1 shadow transition-all hover:shadow-md">
                                <li>
                                    <a>Today</a>
                                </li>
                                <li>
                                    <a>This Week</a>
                                </li>
                                <li>
                                    <a>This Month</a>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
                <div>
                    <ModalUsagesChart />
                </div>
            </div>
        </div>
    );
};
