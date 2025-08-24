import { StorageActivity } from "./StorageActivity";
import { StorageUploadProcess } from "./StorageUploadProcess";

export const StorageOverview = () => {
    return (
        <div className="card bg-base-100 card-border">
            <div className="card-body gap-0">
                <div className="flex items-center justify-between">
                    <p className="font-medium">Overview</p>
                    <button className="btn btn-success btn-outline btn-sm border-transparent">Upgrade Now</button>
                </div>
                <div className="card card-border bg-primary/5 border-primary/10 mt-3">
                    <div className="card-body p-4">
                        <div className="flex items-center gap-2.5">
                            <span className="iconify lucide--hard-drive text-primary size-4.5" />
                            <span className="text-primary font-medium">Local Storage</span>
                            <span className="text-primary ms-auto text-sm font-medium">64%</span>
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-2 text-sm">
                            <span className="font-medium">162 GB</span>
                            <span className="text-base-content/80 text-xs">Used of 250 GB</span>
                        </div>
                        <progress max={250} value={160} className="progress progress-primary mt-1 h-1.5" />
                    </div>
                </div>
                <p className="mt-6 text-sm font-medium">In Process</p>
                <div className="mt-3">
                    <StorageUploadProcess />
                </div>
                <p className="mt-6 text-sm font-medium">File Activity</p>
                <div className="mt-3 overflow-hidden">
                    <StorageActivity />
                </div>
            </div>
        </div>
    );
};
