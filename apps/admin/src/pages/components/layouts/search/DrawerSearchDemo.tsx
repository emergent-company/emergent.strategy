import React from "react";

export const DrawerSearchDemo = () => {
    return (
        <>
            <div className="drawer drawer-end">
                <input id="search-demo-7" type="checkbox" className="drawer-toggle" />
                <div className="drawer-content">
                    <label htmlFor="search-demo-7" className="btn btn-circle btn-soft">
                        <span className="iconify lucide--search size-5" />
                    </label>
                </div>
                <div className="drawer-side">
                    <label htmlFor="search-demo-7" aria-label="close sidebar" className="drawer-overlay"></label>
                    <div className="h-full w-xs p-2 sm:w-sm">
                        <div className="bg-base-100 rounded-box flex h-full flex-col overflow-auto">
                            <div className="mt-4 flex items-center justify-between gap-3 px-4">
                                <label
                                    htmlFor="search-demo-7"
                                    className="btn btn-xs btn-circle btn-ghost"
                                    aria-label="Go back">
                                    <span className="iconify lucide--chevron-left size-4" />
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
                                    <span className="iconify lucide--x size-4" />
                                </label>
                            </div>

                            <div className="mt-4 px-5">
                                <p className="text-base-content/70 text-sm font-medium">Filters applied</p>
                                <div className="mt-2 flex items-center gap-2">
                                    <div className="badge badge-sm">
                                        Electronics
                                        <span className="iconify lucide--x size-3" />
                                    </div>
                                    <div className="badge badge-sm">
                                        In Stock
                                        <span className="iconify lucide--x size-3" />
                                    </div>
                                </div>
                            </div>

                            <ul className="menu mt-2 w-full p-0 px-2">
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
                                            <p className="mt-1.5 text-xs/none opacity-60">#Footwear</p>
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
                                            <p className="mt-1.5 text-xs/none opacity-60">#Skincare</p>
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
                                            <p className="mt-1.5 text-xs/none opacity-60">#HomeTech</p>
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
                                            <p className="mt-1.5 text-xs/none opacity-60">#Footwear</p>
                                        </div>
                                    </div>
                                </li>
                            </ul>

                            <ul className="menu mt-2 w-full p-0 px-2">
                                <li className="menu-title">Orders</li>
                                <li>
                                    <div>
                                        <span className="iconify lucide--receipt size-4 opacity-80"></span>
                                        <p>Order #104562</p>
                                        <div className="badge badge-soft badge-primary badge-sm">Shipped</div>
                                    </div>
                                </li>
                                <li>
                                    <div>
                                        <span className="iconify lucide--receipt size-4 opacity-80"></span>
                                        <p>Order #104563</p>
                                        <div className="badge badge-soft badge-warning badge-sm">Pending</div>
                                    </div>
                                </li>
                                <li>
                                    <div>
                                        <span className="iconify lucide--receipt size-4 opacity-80"></span>
                                        <p>Order #104564</p>
                                        <div className="badge badge-soft badge-success badge-sm">Delivered</div>
                                    </div>
                                </li>
                                <li>
                                    <div>
                                        <span className="iconify lucide--receipt size-4 opacity-80"></span>
                                        <p>Order #104565</p>
                                        <div className="badge badge-soft badge-error badge-sm">Cancelled</div>
                                    </div>
                                </li>
                            </ul>

                            <ul className="menu mt-2 w-full p-0 px-2">
                                <li className="menu-title">Quick Actions</li>

                                <li>
                                    <div>
                                        <span className="iconify lucide--plus-circle size-4" />
                                        <p className="grow text-sm">Add New Product</p>
                                        <div className="kbd kbd-sm text-base-content">N</div>
                                    </div>
                                </li>

                                <li>
                                    <div>
                                        <span className="iconify lucide--archive size-4" />
                                        <p className="grow text-sm">Update Stock</p>
                                        <div className="kbd kbd-sm text-base-content">U</div>
                                    </div>
                                </li>

                                <li>
                                    <div>
                                        <span className="iconify lucide--truck size-4" />
                                        <p className="grow text-sm">Mark Order as Shipped</p>
                                        <div className="kbd kbd-sm text-base-content">S</div>
                                    </div>
                                </li>

                                <li>
                                    <div>
                                        <span className="iconify lucide--x-circle size-4" />
                                        <p className="grow text-sm">Cancel Order</p>
                                        <div className="kbd kbd-sm text-base-content">C</div>
                                    </div>
                                </li>
                            </ul>

                            <div className="border-base-300 mt-auto flex items-center gap-4 border-t px-5 py-3">
                                <div className="flex items-center gap-0.5">
                                    <div className="border-base-300 bg-base-200 flex size-5 items-center justify-center rounded-sm border shadow-xs">
                                        <span className="iconify lucide--arrow-up size-3.5"></span>
                                    </div>
                                    <div className="border-base-300 bg-base-200 flex size-5 items-center justify-center rounded-sm border shadow-xs">
                                        <span className="iconify lucide--arrow-down size-3.5"></span>
                                    </div>
                                    <p className="text-base-content/80 ms-1 text-sm">Navigate</p>
                                </div>
                                <div className="flex items-center gap-0.5">
                                    <div className="border-base-300 bg-base-200 flex size-5 items-center justify-center rounded-sm border shadow-xs">
                                        <span className="iconify lucide--corner-down-left size-3.5"></span>
                                    </div>
                                    <p className="text-base-content/80 ms-1 text-sm">Select</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};
