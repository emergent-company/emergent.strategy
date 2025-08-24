export const StorageActivity = () => {
    return (
        <ul className="timeline timeline-vertical timeline-snap-icon timeline-hr-sm -ms-[100%] ps-10">
            <li>
                <div className="timeline-middle">
                    <div className="bg-primary/10 text-primary flex items-center rounded-full p-2">
                        <span className="iconify lucide--pencil size-4" />
                    </div>
                </div>
                <div className="timeline-end my-2.5 w-full px-4">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Olivia Duncan</span>
                        <span className="text-base-content/60 text-xs">Just Now</span>
                    </div>
                    <p className="text-base-content/70 mt-0.5 text-xs">Edited package.json in e-commerce</p>
                </div>
                <hr />
            </li>
            <li>
                <hr />
                <div className="timeline-middle">
                    <div className="bg-primary/10 text-primary flex items-center rounded-full p-2">
                        <span className="iconify lucide--arrow-up-from-line size-4" />
                    </div>
                </div>
                <div className="timeline-end my-2.5 w-full px-4">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Tillie Frank</span>
                        <span className="text-base-content/60 text-xs">22 hours</span>
                    </div>
                    <p className="text-base-content/70 mt-0.5 text-xs">Uploaded app.tsx file in react directory</p>
                </div>
                <hr />
            </li>
            <li>
                <hr />
                <div className="timeline-middle">
                    <div className="bg-error/10 text-error flex items-center rounded-full p-2">
                        <span className="iconify lucide--trash size-4" />
                    </div>
                </div>
                <div className="timeline-end my-2.5 w-full px-4">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Zaid Pope</span>
                        <span className="text-base-content/60 text-xs">3 days</span>
                    </div>
                    <p className="text-base-content/70 mt-0.5 text-xs">
                        Removed style.css &amp; images folder from root
                    </p>
                </div>
                <hr />
            </li>
            <li>
                <hr />
                <div className="timeline-middle">
                    <div className="bg-primary/10 text-primary flex items-center rounded-full p-2">
                        <span className="iconify lucide--folder-input size-4" />
                    </div>
                </div>
                <div className="timeline-end my-2.5 w-full px-4">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Grover Russo</span>
                        <span className="text-base-content/60 text-xs">Week ago</span>
                    </div>
                    <p className="text-base-content/70 mt-0.5 text-xs">Moved folders to inner directory</p>
                </div>
                <hr />
            </li>
            <li>
                <hr />
                <div className="timeline-middle">
                    <div className="bg-success/10 text-success flex items-center rounded-full p-2">
                        <span className="iconify lucide--folder-plus size-4" />
                    </div>
                </div>
                <div className="timeline-end my-2.5 w-full px-4">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Qasim Cotton</span>
                        <span className="text-base-content/60 text-xs">This month</span>
                    </div>
                    <p className="text-base-content/70 mt-0.5 text-xs">Created the root project</p>
                </div>
                <hr />
            </li>
            <li>
                <hr />
                <div className="timeline-middle">
                    <div className="bg-base-200 flex items-center rounded-full p-2">
                        <span className="iconify lucide--more-horizontal size-4" />
                    </div>
                </div>
                <div className="timeline-end mx-5 my-2">
                    <button className="btn btn-sm btn-soft btn-primary">View Full Activity</button>
                </div>
            </li>
        </ul>
    );
};
