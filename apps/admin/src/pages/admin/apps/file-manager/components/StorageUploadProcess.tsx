import { Icon } from "@/components/ui/Icon";

export const StorageUploadProcess = () => {
    return (
        <div className="card-border border-base-300 card">
            <div className="px-4 pt-3 pb-2 card-body">
                <div>
                    <div className="flex justify-between items-center">
                        <span className="font-medium max-sm:text-sm">Feedback video (.mp4)</span>
                        <div className="inline-flex gap-2">
                            <Icon icon="lucide--pause" className="size-4" />
                            <Icon icon="lucide--x-circle" className="size-4 text-error" />
                        </div>
                    </div>
                    <div className="flex justify-between items-center mt-1 text-xs">
                        <span>70%</span>
                        <span>1.2 GiB</span>
                    </div>
                    <progress className="h-1 align-super progress progress-success" max={100} value={70} />
                </div>
                <div>
                    <div className="flex justify-between items-center">
                        <span className="font-medium max-sm:text-sm">Company revenue (.xlsx)</span>
                        <div className="inline-flex gap-2">
                            <Icon icon="lucide--play" className="size-4" />
                            <Icon icon="lucide--x-circle" className="size-4 text-error" />
                        </div>
                    </div>
                    <div className="flex justify-between items-center mt-1 text-xs">
                        <span>20%</span>
                        <span>12 MiB</span>
                    </div>
                    <progress className="h-1 align-super progress progress-error" max={100} value={20} />
                </div>
            </div>
        </div>
    );
};
