export const OrderDeliveryAddress = () => {
    return (
        <div className="card card-border bg-base-100">
            <div className="card-body">
                <p className="bg-base-200 rounded-box px-3 py-2 font-medium">Delivery Address</p>
                <div className="mt-3 flex gap-3">
                    <span className="iconify lucide--map-pin size-6" />
                    <div className="grow">
                        <p className="font-medium">4239 Bloomfield Way</p>
                        <p className="text-base-content/80 text-sm">Standish - ME 047842</p>
                    </div>
                </div>
                <div className="mt-2 text-end">
                    <button className="btn btn-primary btn-soft btn-sm">
                        <span className="iconify lucide--map size-4" />
                        View on Map
                    </button>
                </div>
            </div>
        </div>
    );
};
