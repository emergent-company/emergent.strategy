export const OrderPaymentDetails = () => {
    return (
        <div className="card card-border bg-base-100">
            <div className="card-body">
                <p className="bg-base-200 rounded-box px-3 py-2 font-medium">Payment Information</p>
                <div className="mt-3 flex gap-3">
                    <span className="iconify lucide--credit-card size-6" />
                    <div className="grow">
                        <p className="font-medium">Ends with 2487</p>
                        <p className="text-base-content/80 text-sm">Expired at 08/27</p>
                    </div>
                    <div className="badge badge-success badge-sm badge-dash">Paid</div>
                </div>
                <div className="mt-2 text-end">
                    <button className="btn btn-primary btn-soft btn-sm">
                        <span className="iconify lucide--arrow-left-right size-4" />
                        Transactions
                    </button>
                </div>
            </div>
        </div>
    );
};
