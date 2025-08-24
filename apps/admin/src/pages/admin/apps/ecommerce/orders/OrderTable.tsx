import { Link } from "react-router";

import { OrderTableRow } from "./OrderTableRow";
import { ordersData } from "./data";

export const OrderTable = () => {
    return (
        <div className="card bg-base-100 mt-5 shadow">
            <div className="card-body p-0">
                <div className="flex items-center justify-between px-5 pt-5">
                    <div className="inline-flex items-center gap-3">
                        <label className="input input-sm">
                            <span className="iconify lucide--search text-base-content/80 size-3.5" />
                            <input
                                type="search"
                                className="w-24 sm:w-36"
                                placeholder="Search along orders"
                                aria-label="Search orders"
                            />
                        </label>
                        <div className="hidden sm:block">
                            <select className="select select-sm w-36" defaultValue="" aria-label="Category">
                                <option value="" disabled>
                                    Select Category
                                </option>
                                <option>Fashion</option>
                                <option>Daily Need</option>
                                <option>Cosmetic</option>
                                <option>Electronics</option>
                                <option>Food</option>
                            </select>
                        </div>
                    </div>
                    <Link to="/dashboards/ecommerce" className="btn btn-sm btn-primary">
                        <span className="iconify lucide--monitor-dot size-4" />
                        <span className="hidden sm:inline">Dashboard</span>
                    </Link>
                </div>
                <div className="mt-4 overflow-auto">
                    <table className="table">
                        <thead>
                            <tr>
                                <th className="px-6">
                                    <input aria-label="Check all" type="checkbox" className="checkbox checkbox-sm" />
                                </th>
                                <th>ID</th>
                                <th>Name</th>
                                <th>Customer</th>
                                <th>Price</th>
                                <th>Payment</th>
                                <th>Status</th>
                                <th>Ordered At</th>
                                <th>Action</th>
                            </tr>
                        </thead>

                        <tbody>
                            {ordersData.map((order) => (
                                <OrderTableRow {...order} key={order.id} />
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="flex items-center justify-between p-6">
                    <div className="text-base-content/80 hover:text-base-content flex gap-2 text-sm">
                        <span className="hidden sm:inline">Per page</span>
                        <select className="select select-xs w-18" defaultValue="20" aria-label="Per page">
                            <option value="10">10</option>
                            <option value="20">20</option>
                            <option value="50">50</option>
                            <option value="100">100</option>
                        </select>
                    </div>
                    <span className="text-base-content/80 hidden text-sm lg:inline">
                        Showing <span className="text-base-content font-medium">1 to 20</span> of 457 items
                    </span>
                    <div className="inline-flex items-center gap-1">
                        <button className="btn btn-circle sm:btn-sm btn-xs btn-ghost" aria-label="Prev">
                            <span className="iconify lucide--chevron-left"></span>
                        </button>
                        <button className="btn btn-primary btn-circle sm:btn-sm btn-xs">1</button>
                        <button className="btn btn-ghost btn-circle sm:btn-sm btn-xs">2</button>
                        <button className="btn btn-ghost btn-circle sm:btn-sm btn-xs">3</button>
                        <button className="btn btn-circle sm:btn-sm btn-xs btn-ghost" aria-label="Next">
                            <span className="iconify lucide--chevron-right"></span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
