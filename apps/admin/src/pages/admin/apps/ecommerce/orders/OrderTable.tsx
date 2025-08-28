import { Link } from "react-router";

import { OrderTableRow } from "./OrderTableRow";
import { ordersData } from "./data";

export const OrderTable = () => {
    return (
        <div className="bg-base-100 shadow mt-5 card">
            <div className="p-0 card-body">
                <div className="flex justify-between items-center px-5 pt-5">
                    <div className="inline-flex items-center gap-3">
                        <label className="input input-sm">
                            <span className="size-3.5 text-base-content/80 iconify lucide--search" />
                            <input
                                type="search"
                                className="w-24 sm:w-36"
                                placeholder="Search along orders"
                                aria-label="Search orders"
                            />
                        </label>
                        <div className="hidden sm:block">
                            <select className="w-36 select-sm select" defaultValue="" aria-label="Category">
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
                    <Link to="/admin" className="btn btn-sm btn-primary">
                        <span className="size-4 iconify lucide--monitor-dot" />
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
                <div className="flex justify-between items-center p-6">
                    <div className="flex gap-2 text-sm text-base-content/80 hover:text-base-content">
                        <span className="hidden sm:inline">Per page</span>
                        <select className="w-18 select-xs select" defaultValue="20" aria-label="Per page">
                            <option value="10">10</option>
                            <option value="20">20</option>
                            <option value="50">50</option>
                            <option value="100">100</option>
                        </select>
                    </div>
                    <span className="hidden lg:inline text-sm text-base-content/80">
                        Showing <span className="font-medium text-base-content">1 to 20</span> of 457 items
                    </span>
                    <div className="inline-flex items-center gap-1">
                        <button className="btn btn-circle sm:btn-sm btn-xs btn-ghost" aria-label="Prev">
                            <span className="lucide--chevron-left iconify"></span>
                        </button>
                        <button className="btn btn-primary btn-circle sm:btn-sm btn-xs">1</button>
                        <button className="btn btn-ghost btn-circle sm:btn-sm btn-xs">2</button>
                        <button className="btn btn-ghost btn-circle sm:btn-sm btn-xs">3</button>
                        <button className="btn btn-circle sm:btn-sm btn-xs btn-ghost" aria-label="Next">
                            <span className="lucide--chevron-right iconify"></span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
