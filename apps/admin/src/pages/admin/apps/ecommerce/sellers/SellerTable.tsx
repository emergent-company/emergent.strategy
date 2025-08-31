import { Link } from "react-router";
import { Icon } from "@/components/ui/Icon";

import { SellerTableRow } from "./SellerTableRow";
import { sellersData } from "./data";

export const SellerTable = () => {
    return (
        <>
            <div className="bg-base-100 shadow card">
                <div className="p-0 card-body">
                    <div className="flex justify-between items-center px-5 pt-5">
                        <div className="inline-flex items-center gap-3">
                            <label className="input input-sm">
                                <Icon icon="lucide--search" className="size-3.5 text-base-content/80" aria-hidden />
                                <input
                                    type="search"
                                    className="w-24 sm:w-36"
                                    placeholder="Search along sellers"
                                    aria-label="Search sellers"
                                />
                            </label>
                            <div className="hidden sm:block">
                                <select
                                    className="w-40 select-sm select"
                                    defaultValue=""
                                    aria-label="Verification status">
                                    <option value="" disabled>
                                        Verification Status
                                    </option>
                                    <option>Verified</option>
                                    <option>Unverified</option>
                                </select>
                            </div>
                        </div>
                        <div className="inline-flex items-center gap-3">
                            <Link
                                to="/apps/ecommerce/sellers/create"
                                aria-label="Create seller link"
                                className="btn btn-primary btn-sm max-sm:btn-square">
                                <Icon icon="lucide--plus" className="size-4" aria-hidden />
                                <span className="hidden sm:inline">New Seller</span>
                            </Link>
                            <div className="dropdown-bottom dropdown dropdown-end">
                                <div
                                    tabIndex={0}
                                    role="button"
                                    className="border-base-300 btn btn-ghost btn-sm btn-square"
                                    aria-label="More option">
                                    <Icon icon="lucide--settings-2" className="size-4" aria-hidden />
                                </div>
                                <div tabIndex={0} className="z-1 bg-base-100 shadow rounded-box w-52 dropdown-content">
                                    <ul className="p-2 w-full menu">
                                        <li>
                                            <div>
                                                <Icon icon="lucide--wand" className="size-4" aria-hidden />
                                                Bulk Actions
                                            </div>
                                        </li>
                                    </ul>
                                    <hr className="border-base-300" />
                                    <ul className="p-2 w-full menu">
                                        <li>
                                            <div>
                                                <Icon icon="lucide--download-cloud" className="size-4" aria-hidden />
                                                Import from Store
                                            </div>
                                        </li>
                                        <li>
                                            <div>
                                                <Icon icon="lucide--copy-plus" className="size-4" aria-hidden />
                                                Create from Existing
                                            </div>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 overflow-auto">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>
                                        <input
                                            id="seller_check_all"
                                            aria-label="Check all"
                                            type="checkbox"
                                            className="checkbox checkbox-sm"
                                        />
                                    </th>
                                    <th>ID</th>
                                    <th>Name</th>
                                    <th>Shop</th>
                                    <th>Email</th>
                                    <th>Mobile</th>
                                    <th>Sales</th>
                                    <th>Earning</th>
                                    <th>Verified</th>
                                    <th>Joined Date</th>
                                    <th>Action</th>
                                </tr>
                            </thead>

                            <tbody>
                                {sellersData.map((seller) => (
                                    <SellerTableRow {...seller} key={seller.id} />
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
                                <Icon icon="lucide--chevron-left" aria-hidden />
                            </button>
                            <button className="btn btn-primary btn-circle sm:btn-sm btn-xs">1</button>
                            <button className="btn btn-ghost btn-circle sm:btn-sm btn-xs">2</button>
                            <button className="btn btn-ghost btn-circle sm:btn-sm btn-xs">3</button>
                            <button className="btn btn-circle sm:btn-sm btn-xs btn-ghost" aria-label="Next">
                                <Icon icon="lucide--chevron-right" aria-hidden />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <dialog id="apps-seller-delete" className="modal">
                <div className="modal-box">
                    <div className="flex justify-between items-center font-medium text-lg">
                        Confirm Delete
                        <form method="dialog">
                            <button className="btn btn-sm btn-ghost btn-circle" aria-label="Close modal">
                                <Icon icon="lucide--x" className="size-4" aria-hidden />
                            </button>
                        </form>
                    </div>
                    <p className="py-4"> You are about to delete this seller. Would you like to proceed further ?</p>
                    <div className="modal-action">
                        <form method="dialog">
                            <button className="btn btn-ghost btn-sm">No</button>
                        </form>
                        <form method="dialog">
                            <button className="btn btn-sm btn-error">Yes, delete it</button>
                        </form>
                    </div>
                </div>
                <form method="dialog" className="modal-backdrop">
                    <button>close</button>
                </form>
            </dialog>
        </>
    );
};
