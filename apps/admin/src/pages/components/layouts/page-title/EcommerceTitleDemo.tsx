export const EcommerceTitleDemo = () => {
    return (
        <div className="flex w-full items-center justify-between">
            <div>
                <p className="font-medium">Order Summary</p>
                <p className="text-base-content/70 text-xs">
                    ID: <span className="text-base-content font-medium">#12541</span>
                </p>
            </div>

            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                    <span className="iconify lucide--calendar-days size-4"></span>
                    <span className="text-base-content/80 text-sm max-md:hidden">{new Date().toDateString()}</span>
                </div>
                <hr className="border-base-300 h-7 w-px border-e border-dashed max-md:hidden" />
                <div className="flex items-center gap-2 max-md:hidden">
                    <label className="text-sm font-medium" htmlFor="status">
                        Status
                    </label>
                    <select id="status" aria-label="Order status" className="select select-sm w-24">
                        <option>Paid</option>
                        <option>Unpaid</option>
                    </select>
                </div>
                <hr className="border-base-300 h-7 w-px border-e border-dashed" />
                <div className="flex items-center gap-2">
                    <button className="btn btn-primary btn-sm max-md:btn-square gap-2">
                        <span className="iconify lucide--download size-4"></span>
                        <span className="max-md:hidden">Invoice</span>
                    </button>

                    <button className="btn btn-outline btn-sm border-base-300 btn-square" aria-label="More options">
                        <span className="iconify lucide--more-vertical size-4"></span>
                    </button>
                </div>
            </div>
        </div>
    );
};
