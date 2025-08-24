export const BasicNotificationDemo = () => {
    const closeMenu = () => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    };

    return (
        <div className="dropdown dropdown-bottom sm:dropdown-end dropdown-center">
            <div tabIndex={0} role="button" className="btn btn-circle btn-soft" aria-label="Notifications">
                <span className="iconify lucide--bell size-5" />
            </div>
            <div tabIndex={0} className="dropdown-content bg-base-100 rounded-box mt-3 w-84 p-2 pt-3 shadow">
                <div className="flex items-start justify-between px-2">
                    <p className="font-medium">Notification</p>
                    <button className="btn btn-xs btn-circle btn-ghost" aria-label="Close" onClick={closeMenu}>
                        <span className="iconify lucide--x size-4" />
                    </button>
                </div>
                <div className="mt-3 flex items-center justify-center">
                    <div className="badge badge-sm badge-primary badge-soft">Today</div>
                </div>
                <div className="mt-2 space-y-0.5">
                    <div className="rounded-box hover:bg-base-200 flex cursor-pointer items-center gap-3 px-2 py-1 transition-all">
                        <img
                            src="/images/avatars/4.png"
                            className="bg-base-200 mask mask-squircle px -0.5 size-10 pt-0.5"
                            alt=""
                        />
                        <p className="grow text-sm leading-tight">
                            Customer has requested a <span className="text-error">return</span> for item
                            <span className="text-base-content/60 float-end ms-2 text-xs">Now</span>
                        </p>
                    </div>
                    <div className="rounded-box hover:bg-base-200 flex cursor-pointer items-center gap-3 px-2 py-1 transition-all">
                        <img
                            src="/images/avatars/5.png"
                            className="bg-base-200 mask mask-squircle size-10 px-0.5 pt-0.5"
                            alt=""
                        />
                        <p className="grow text-sm leading-tight">
                            A new <span className="underline">review</span> has been submitted for product
                            <span className="text-base-content/60 float-end ms-2 text-xs">15 min ago</span>
                        </p>
                    </div>
                </div>
                <div className="mt-2 flex items-center justify-center">
                    <div className="badge badge-sm">Seen</div>
                </div>
                <div className="mt-2 space-y-0.5">
                    <div className="rounded-box hover:bg-base-200 flex cursor-pointer items-center gap-3 px-2 py-1 transition-all">
                        <img
                            src="/images/avatars/1.png"
                            className="bg-base-200 mask mask-squircle size-10 px-0.5 pt-0.5"
                            alt=""
                        />
                        <p className="grow text-sm leading-tight">
                            Prepare for the upcoming weekend promotion
                            <span className="text-base-content/60 float-end ms-2 text-xs">2 days ago</span>
                        </p>
                    </div>
                    <div className="rounded-box hover:bg-base-200 flex cursor-pointer items-center gap-3 px-2 py-1 transition-all">
                        <img
                            src="/images/avatars/2.png"
                            className="bg-base-200 mask mask-squircle size-10 px-0.5 pt-0.5"
                            alt=""
                        />
                        <p className="grow text-sm leading-tight">
                            Product <span className="border-base-300 border-b border-dashed">#ABC123</span> is running
                            low in stock.
                            <span className="text-base-content/60 float-end ms-2 text-xs">3 days ago</span>
                        </p>
                    </div>
                    <div className="rounded-box hover:bg-base-200 flex cursor-pointer items-center gap-3 px-2 py-1 transition-all">
                        <img
                            src="/images/avatars/3.png"
                            className="bg-base-200 mask mask-squircle size-10 px-0.5 pt-0.5"
                            alt=""
                        />
                        <p className="grow text-sm leading-tight">
                            Payment received for Order ID: <span className="font-medium">#67890</span>
                            <span className="text-base-content/60 float-end ms-2 text-xs">week ago</span>
                        </p>
                    </div>
                </div>
                <hr className="border-base-300 -mx-2 mt-2 border-dashed" />
                <div className="flex items-center justify-between pt-2">
                    <button className="btn btn-sm btn-ghost">Mark as read</button>
                    <button className="btn btn-sm btn-soft btn-primary">View All</button>
                </div>
            </div>
        </div>
    );
};
