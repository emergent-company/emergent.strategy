import { Link } from "react-router";
import { Icon } from "@/components/ui/Icon";

import { AiLibraryTableRow } from "./LibraryTableRow";
import { aiLibraryData } from "./helpers";

export const AiLibraryTable = () => {
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
                                    placeholder="Search along items"
                                    aria-label="Search items"
                                />
                            </label>
                        </div>
                        <div className="inline-flex items-center gap-3">
                            <Link
                                to="/apps/gen-ai/image"
                                aria-label="Generate image link"
                                className="btn btn-primary btn-sm max-sm:btn-square">
                                <Icon icon="lucide--wand-2" className="size-3.5" aria-hidden />
                                <span className="max-sm:hidden">Generate</span>
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
                                            id="check_all"
                                            aria-label="Check all"
                                            type="checkbox"
                                            className="checkbox checkbox-sm"
                                        />
                                    </th>
                                    <th>ID</th>
                                    <th>User</th>
                                    <th>Type</th>
                                    <th>Title</th>
                                    <th>Content</th>
                                    <th>Tokens</th>
                                    <th>Action</th>
                                </tr>
                            </thead>

                            <tbody>
                                {aiLibraryData.map((library) => (
                                    <AiLibraryTableRow {...library} key={library.id} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex justify-between items-center p-6">
                        <div className="flex gap-2 text-sm text-base-content/80">
                            <span className="hidden sm:inline">Per page</span>
                            <select className="w-18 select-xs select" defaultValue="10" aria-label="Per page">
                                <option value="10">10</option>
                                <option value="20">20</option>
                                <option value="50">50</option>
                                <option value="100">100</option>
                            </select>
                        </div>
                        <span className="hidden lg:inline text-sm text-base-content/80">
                            Showing <span className="font-medium text-base-content">1 to 10</span> of 457 items
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
            <dialog id="apps-ai-library-delete" className="modal">
                <div className="modal-box">
                    <div className="flex justify-between items-center font-medium text-lg">
                        Confirm Delete
                        <form method="dialog">
                            <button className="btn btn-sm btn-ghost btn-circle" aria-label="Close modal">
                                <span className="sr-only">Close</span>
                                <Icon icon="lucide--x" className="size-4" aria-hidden />
                            </button>
                        </form>
                    </div>
                    <p className="py-4">You are about to delete this item. Would you like to proceed further ?</p>
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
