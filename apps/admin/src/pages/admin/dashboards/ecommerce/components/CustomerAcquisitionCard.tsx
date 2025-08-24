import { CustomerAcquisitionChart } from "./CustomerAcquisitionChart";

export const CustomerAcquisitionCard = () => {
    return (
        <div className="card bg-base-100 shadow">
            <div className="card-body p-0">
                <div className="flex items-center justify-between px-5 pt-5">
                    <span className="font-medium">Customer Acquisition</span>
                    <div className="inline-flex items-center gap-2">
                        <div className="text-base-content/60 w-6 border border-dashed"></div>
                        <span className="text-base-content/80 text-xs">Prediction</span>
                    </div>
                </div>
                <div className="mt-4 py-3">
                    <div className="divide-base-300 grid grid-cols-2 gap-5 px-5 sm:grid-cols-3 sm:divide-x">
                        <div className="text-center">
                            <p>Advertise</p>
                            <p className="mt-0.5 text-xl font-medium">$148</p>
                            <div className="text-success mt-0.5 inline-flex items-center gap-1">
                                <span className="iconify lucide--arrow-up size-3" />
                                <p className="text-xs">4.78%</p>
                            </div>
                        </div>
                        <div className="hidden text-center sm:block">
                            <p>Customers</p>
                            <p className="mt-0.5 text-xl font-medium">427</p>
                            <div className="text-success mt-0.5 inline-flex items-center gap-1">
                                <span className="iconify lucide--arrow-up size-3" />
                                <p className="text-xs">3.15%</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="-mt-25 sm:mx-5">
                    <CustomerAcquisitionChart />
                </div>
            </div>
        </div>
    );
};
