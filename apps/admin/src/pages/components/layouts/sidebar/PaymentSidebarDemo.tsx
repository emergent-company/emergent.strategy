import { Link } from "react-router";

export const PaymentSidebarDemo = () => {
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
                <p className="text-base-content/50 font-medium">Basic</p>
            </div>

            <div className="custom-scrollbar grow overflow-auto">
                <div className="mt-3 space-y-0.5 px-2.5">
                    <Link to="#" className="menu-item">
                        <span className="iconify lucide--home size-4"></span>
                        <p>Home</p>
                    </Link>
                    <Link to="#" className="menu-item">
                        <span className="iconify lucide--bar-chart-2 size-4"></span>
                        <p>Overview</p>
                    </Link>
                </div>
                <p className="menu-label mt-4 px-5">Transactions</p>
                <div className="mt-1 space-y-0.5 px-2.5">
                    <Link to="#" className="menu-item">
                        <span className="iconify lucide--credit-card size-4"></span>
                        <p>Payment History</p>
                    </Link>
                    <Link to="#" className="menu-item">
                        <span className="iconify lucide--dollar-sign size-4"></span>
                        <p>Send Payment</p>
                    </Link>
                    <Link to="#" className="menu-item">
                        <span className="iconify lucide--repeat size-4"></span>
                        <p>Recurring Payments</p>
                    </Link>
                </div>

                <p className="menu-label mt-4 px-5">Account</p>
                <div className="mt-1 space-y-0.5 px-2.5">
                    <Link to="#" className="menu-item">
                        <span className="iconify lucide--user size-4"></span>
                        <p>Profile</p>
                    </Link>
                    <Link to="#" className="menu-item">
                        <span className="iconify lucide--lock size-4"></span>
                        <p>Security</p>
                    </Link>
                    <Link to="#" className="menu-item">
                        <span className="iconify lucide--wallet size-4"></span>
                        <p>Wallet</p>
                    </Link>
                </div>
            </div>

            <div className="px-2.5 pt-4">
                <Link to="#" className="menu-item">
                    <span className="iconify lucide--settings size-4"></span>
                    <p>Settings</p>
                </Link>
                <label className="menu-item menu-item-link">
                    <span className="iconify lucide--flask-conical size-4"></span>
                    <p className="grow">Test Mode</p>
                    <input
                        type="checkbox"
                        id="basic-test-mode"
                        defaultChecked
                        className="toggle toggle-xs toggle-primary"
                    />
                </label>
                <Link to="#" className="menu-item">
                    <span className="iconify lucide--log-out size-4"></span>
                    <p>Logout</p>
                </Link>
            </div>
        </div>
    );
};
