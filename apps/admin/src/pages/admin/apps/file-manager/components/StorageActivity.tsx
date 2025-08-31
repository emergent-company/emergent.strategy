import { Icon } from "@/components/ui/Icon";

export const StorageActivity = () => {
    return (
        <ul className="-ms-[100%] ps-10 timeline-snap-icon timeline timeline-vertical timeline-hr-sm">
            <li>
                <div className="timeline-middle">
                    <div className="flex items-center bg-primary/10 p-2 rounded-full text-primary">
                        <Icon icon="lucide--pencil" className="size-4" />
                    </div>
                </div>
                <div className="my-2.5 px-4 w-full timeline-end">
                    <div className="flex justify-between items-center">
                        <span className="font-medium text-sm">Olivia Duncan</span>
                        <span className="text-xs text-base-content/60">Just Now</span>
                    </div>
                    <p className="mt-0.5 text-xs text-base-content/70">Edited package.json in e-commerce</p>
                </div>
                <hr />
            </li>
            <li>
                <hr />
                <div className="timeline-middle">
                    <div className="flex items-center bg-primary/10 p-2 rounded-full text-primary">
                        <Icon icon="lucide--arrow-up-from-line" className="size-4" />
                    </div>
                </div>
                <div className="my-2.5 px-4 w-full timeline-end">
                    <div className="flex justify-between items-center">
                        <span className="font-medium text-sm">Tillie Frank</span>
                        <span className="text-xs text-base-content/60">22 hours</span>
                    </div>
                    <p className="mt-0.5 text-xs text-base-content/70">Uploaded app.tsx file in react directory</p>
                </div>
                <hr />
            </li>
            <li>
                <hr />
                <div className="timeline-middle">
                    <div className="flex items-center bg-error/10 p-2 rounded-full text-error">
                        <Icon icon="lucide--trash" className="size-4" />
                    </div>
                </div>
                <div className="my-2.5 px-4 w-full timeline-end">
                    <div className="flex justify-between items-center">
                        <span className="font-medium text-sm">Zaid Pope</span>
                        <span className="text-xs text-base-content/60">3 days</span>
                    </div>
                    <p className="mt-0.5 text-xs text-base-content/70">
                        Removed style.css &amp; images folder from root
                    </p>
                </div>
                <hr />
            </li>
            <li>
                <hr />
                <div className="timeline-middle">
                    <div className="flex items-center bg-primary/10 p-2 rounded-full text-primary">
                        <Icon icon="lucide--folder-input" className="size-4" />
                    </div>
                </div>
                <div className="my-2.5 px-4 w-full timeline-end">
                    <div className="flex justify-between items-center">
                        <span className="font-medium text-sm">Grover Russo</span>
                        <span className="text-xs text-base-content/60">Week ago</span>
                    </div>
                    <p className="mt-0.5 text-xs text-base-content/70">Moved folders to inner directory</p>
                </div>
                <hr />
            </li>
            <li>
                <hr />
                <div className="timeline-middle">
                    <div className="flex items-center bg-success/10 p-2 rounded-full text-success">
                        <Icon icon="lucide--folder-plus" className="size-4" />
                    </div>
                </div>
                <div className="my-2.5 px-4 w-full timeline-end">
                    <div className="flex justify-between items-center">
                        <span className="font-medium text-sm">Qasim Cotton</span>
                        <span className="text-xs text-base-content/60">This month</span>
                    </div>
                    <p className="mt-0.5 text-xs text-base-content/70">Created the root project</p>
                </div>
                <hr />
            </li>
            <li>
                <hr />
                <div className="timeline-middle">
                    <div className="flex items-center bg-base-200 p-2 rounded-full">
                        <Icon icon="lucide--more-horizontal" className="size-4" />
                    </div>
                </div>
                <div className="mx-5 my-2 timeline-end">
                    <button className="btn btn-sm btn-soft btn-primary">View Full Activity</button>
                </div>
            </li>
        </ul>
    );
};
