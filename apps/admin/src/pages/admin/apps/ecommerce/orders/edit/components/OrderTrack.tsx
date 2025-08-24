export const OrderTrack = () => {
    return (
        <ul className="timeline timeline-vertical timeline-snap-icon timeline-hr-sm -ms-[100%] ps-10">
            <li>
                <div className="timeline-middle">
                    <div className="bg-base-200 flex items-center rounded-full p-2">
                        <span className="iconify lucide--clipboard size-4.5" />
                    </div>
                </div>
                <div className="timeline-end my-2.5 w-full px-4">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Ordered</span>
                        <span className="text-base-content/60 text-xs">4 days</span>
                    </div>
                    <p className="text-base-content/70 text-xs">Samuel E. Clark ordered it via app</p>
                </div>
                <hr />
            </li>
            <li>
                <hr />
                <div className="timeline-middle">
                    <div className="bg-base-200 flex items-center rounded-full p-2">
                        <span className="iconify lucide--clipboard-check size-4.5" />
                    </div>
                </div>
                <div className="timeline-end my-2.5 w-full px-4">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Accepted</span>
                        <span className="text-base-content/60 text-xs">3 days</span>
                    </div>
                    <p className="text-base-content/70 text-xs">Cafe day's accept order</p>
                </div>
                <hr />
            </li>
            <li>
                <hr />
                <div className="timeline-middle">
                    <div className="bg-base-200 flex items-center rounded-full p-2">
                        <span className="iconify lucide--package-check size-4.5" />
                    </div>
                </div>
                <div className="timeline-end my-2.5 w-full px-4">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Ready to dispatch</span>
                        <span className="text-base-content/60 text-xs">23 hours</span>
                    </div>
                    <p className="text-base-content/70 text-xs">Packaging done with instructions</p>
                </div>
                <hr />
            </li>
            <li>
                <hr />
                <div className="timeline-middle">
                    <div className="bg-base-200 flex items-center rounded-full p-2">
                        <span className="iconify lucide--truck size-4.5" />
                    </div>
                </div>
                <div className="timeline-end my-2.5 w-full px-4">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">On the Way</span>
                        <span className="text-base-content/60 text-xs">2 hours</span>
                    </div>
                    <p className="text-base-content/70 text-xs">Way's truck goes for delivery</p>
                </div>
                <hr />
            </li>
            <li>
                <hr />
                <div className="timeline-middle">
                    <div className="bg-primary/10 text-primary flex items-center rounded-full p-2">
                        <span className="iconify lucide--package-open size-4.5" />
                    </div>
                </div>
                <div className="timeline-end my-2.5 w-full px-4">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Delivered</span>
                        <span className="text-base-content/60 text-xs">24 minutes</span>
                    </div>
                    <p className="text-base-content/70 text-xs">Order put your door at snap</p>
                </div>
                <hr />
            </li>
            <li>
                <hr />
                <div className="timeline-middle">
                    <div className="bg-success/10 text-success flex items-center rounded-full p-2">
                        <span className="iconify lucide--stars size-4.5" />
                    </div>
                </div>
                <div className="timeline-end mx-5 my-2">
                    <button className="btn btn-sm btn-soft btn-success">Review order</button>
                </div>
            </li>
        </ul>
    );
};
