import React from "react";
import { Icon } from "@/components/ui/Icon";

export const DrawerSearchDemo = () => {
    return (
        <>
            <div className="drawer drawer-end">
                <input id="search-demo-7" type="checkbox" className="drawer-toggle" />
                <div className="drawer-content">
                    <label htmlFor="search-demo-7" className="btn btn-circle btn-soft" aria-label="Open search drawer">
                        <Icon icon="lucide--search" className="size-5" />
                    </label>
                </div>
                <div className="drawer-side">
                    <label htmlFor="search-demo-7" aria-label="close sidebar" className="drawer-overlay"></label>
                    <div className="p-2 w-xs sm:w-sm h-full">
                        <div className="flex flex-col bg-base-100 rounded-box h-full overflow-auto">
                            <div className="flex justify-between items-center gap-3 mt-4 px-4">
                                <label
                                    htmlFor="search-demo-7"
                                    className="btn btn-xs btn-circle btn-ghost"
                                    aria-label="Go back">
                                    <Icon icon="lucide--chevron-left" className="size-4" />
                                </label>
                                <input
                                    type="search"
                                    className="input input-sm grow"
                                    placeholder="Search products, orders, or tags"
                                    aria-label="Search"
                                />
                                <label
                                    htmlFor="search-demo-7"
                                    className="btn btn-xs btn-circle btn-ghost"
                                    aria-label="Clear search">
                                    <Icon icon="lucide--x" className="size-4" />
                                </label>
                            </div>

                            <div className="mt-4 px-5">
                                <p className="font-medium text-sm text-base-content/70">Filters applied</p>
                                <div className="flex items-center gap-2 mt-2">
                                    <div className="badge badge-sm">
                                        Electronics
                                        <span className="size-3 iconify lucide--x" />
                                    </div>
                                    <div className="badge badge-sm">
                                        In Stock
                                        <span className="size-3 iconify lucide--x" />
                                    </div>
                                </div>
                            </div>

                            <ul className="mt-2 p-0 px-2 w-full menu">
                                <li className="menu-title">Products</li>
                                <li>
                                    <div>
                                        <img
                                            src="/images/apps/ecommerce/products/1.jpg"
                                            alt="Product image"
                                            className="rounded-box size-9 object-cover"
                                        />
                                        <div>
                                            <p className="text-sm/none">Running Shoes</p>
                                            <p className="opacity-60 mt-1.5 text-xs/none">#Footwear</p>
                                        </div>
                                    </div>
                                </li>
                                <li>
                                    <div>
                                        <img
                                            src="/images/apps/ecommerce/products/2.jpg"
                                            alt="Product image"
                                            className="rounded-box size-9 object-cover"
                                        />
                                        <div>
                                            <p className="text-sm/none">Organic Body Oil</p>
                                            <p className="opacity-60 mt-1.5 text-xs/none">#Skincare</p>
                                        </div>
                                    </div>
                                </li>
                                <li>
                                    <div>
                                        <img
                                            src="/images/apps/ecommerce/products/3.jpg"
                                            alt="Product image"
                                            className="rounded-box size-9 object-cover"
                                        />
                                        <div>
                                            <p className="text-sm/none">Mini Air Purifier</p>
                                            <p className="opacity-60 mt-1.5 text-xs/none">#HomeTech</p>
                                        </div>
                                    </div>
                                </li>
                                <li>
                                    <div>
                                        <img
                                            src="/images/apps/ecommerce/products/4.jpg"
                                            alt="Product image"
                                            className="rounded-box size-9 object-cover"
                                        />
                                        <div>
                                            <p className="text-sm/none">Women's Sneakers</p>
                                            <p className="opacity-60 mt-1.5 text-xs/none">#Footwear</p>
                                        </div>
                                    </div>
                                </li>
                            </ul>

                            <ul className="mt-2 p-0 px-2 w-full menu">
                                <li className="menu-title">Orders</li>
                                <li>
                                    <div>
                                        <Icon icon="lucide--receipt" className="opacity-80 size-4" />
                                        <p>Order #104562</p>
                                        <div className="badge badge-soft badge-primary badge-sm">Shipped</div>
                                    </div>
                                </li>
                                <li>
                                    <div>
                                        <Icon icon="lucide--receipt" className="opacity-80 size-4" />
                                        <p>Order #104563</p>
                                        <div className="badge badge-soft badge-warning badge-sm">Pending</div>
                                    </div>
                                </li>
                                <li>
                                    <div>
                                        <Icon icon="lucide--receipt" className="opacity-80 size-4" />
                                        <p>Order #104564</p>
                                        <div className="badge badge-soft badge-success badge-sm">Delivered</div>
                                    </div>
                                </li>
                                <li>
                                    <div>
                                        <Icon icon="lucide--receipt" className="opacity-80 size-4" />
                                        <p>Order #104565</p>
                                        <div className="badge badge-soft badge-error badge-sm">Cancelled</div>
                                    </div>
                                </li>
                            </ul>

                            <ul className="mt-2 p-0 px-2 w-full menu">
                                <li className="menu-title">Quick Actions</li>

                                <li>
                                    <div>
                                        <Icon icon="lucide--plus-circle" className="size-4" />
                                        <p className="text-sm grow">Add New Product</p>
                                        <div className="text-base-content kbd kbd-sm">N</div>
                                    </div>
                                </li>

                                <li>
                                    <div>
                                        <Icon icon="lucide--archive" className="size-4" />
                                        <p className="text-sm grow">Update Stock</p>
                                        <div className="text-base-content kbd kbd-sm">U</div>
                                    </div>
                                </li>

                                <li>
                                    <div>
                                        <Icon icon="lucide--truck" className="size-4" />
                                        <p className="text-sm grow">Mark Order as Shipped</p>
                                        <div className="text-base-content kbd kbd-sm">S</div>
                                    </div>
                                </li>

                                <li>
                                    <div>
                                        <Icon icon="lucide--x-circle" className="size-4" />
                                        <p className="text-sm grow">Cancel Order</p>
                                        <div className="text-base-content kbd kbd-sm">C</div>
                                    </div>
                                </li>
                            </ul>

                            <div className="flex items-center gap-4 mt-auto px-5 py-3 border-t border-base-300">
                                <div className="flex items-center gap-0.5">
                                    <div className="flex justify-center items-center bg-base-200 shadow-xs border border-base-300 rounded-sm size-5">
                                        <Icon icon="lucide--arrow-up" className="size-3.5" />
                                    </div>
                                    <div className="flex justify-center items-center bg-base-200 shadow-xs border border-base-300 rounded-sm size-5">
                                        <Icon icon="lucide--arrow-down" className="size-3.5" />
                                    </div>
                                    <p className="ms-1 text-sm text-base-content/80">Navigate</p>
                                </div>
                                <div className="flex items-center gap-0.5">
                                    <div className="flex justify-center items-center bg-base-200 shadow-xs border border-base-300 rounded-sm size-5">
                                        <Icon icon="lucide--corner-down-left" className="size-3.5" />
                                    </div>
                                    <p className="ms-1 text-sm text-base-content/80">Select</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};
