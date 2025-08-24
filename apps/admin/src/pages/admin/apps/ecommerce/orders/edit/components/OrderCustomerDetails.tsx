export const OrderCustomerDetails = () => {
    return (
        <div className="card card-border bg-base-100">
            <div className="card-body">
                <p className="bg-base-200 rounded-box px-3 py-2 font-medium">Customer Details</p>
                <div className="mt-3 flex items-center gap-3">
                    <img src="/images/avatars/5.png" className="bg-base-200 mask mask-squircle size-10 p-0.5" alt="" />
                    <div className="grow">
                        <p className="font-medium">James J. Herron</p>
                        <p className="text-base-content/80 text-sm">james@mail.com</p>
                    </div>
                </div>
                <div className="mt-2 flex items-center justify-end gap-1">
                    <button aria-label="call a customer" className="btn btn-ghost btn-sm btn-circle">
                        <span className="iconify lucide--phone size-4" />
                    </button>
                    <button aria-label="mail to customer" className="btn btn-ghost btn-sm btn-circle">
                        <span className="iconify lucide--mail size-4" />
                    </button>
                </div>
            </div>
        </div>
    );
};
