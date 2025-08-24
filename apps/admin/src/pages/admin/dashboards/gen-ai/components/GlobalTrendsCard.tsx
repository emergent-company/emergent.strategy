export const GlobalTrendsCard = () => {
    return (
        <div aria-label="Card" className="card bg-base-100 shadow">
            <div className="card-body p-0">
                <div className="flex items-center gap-3 px-5 pt-5">
                    <span className="iconify lucide--globe size-4.5" />
                    <span className="font-medium">Global AI Trends</span>
                    <button className="btn btn-outline border-base-300 max-sm:btn-square btn-sm ms-auto">
                        <span className="iconify lucide--download size-3.5" />
                        <span className="max-sm:hidden">Download</span>
                    </button>
                </div>
                <div className="space-y-2.5 p-5">
                    <div className="bg-base-200/80 flex h-8 w-full items-center justify-between rounded-full">
                        <div className="bg-primary/30 flex h-8 w-[67%] items-center rounded-full ps-5 text-sm">
                            India
                        </div>
                        <span className="me-4 text-sm">67%</span>
                    </div>
                    <div className="bg-base-200/80 flex h-8 w-full items-center justify-between rounded-full">
                        <div className="bg-secondary/30 flex h-8 w-[78%] items-center rounded-full ps-5 text-sm">
                            United States
                        </div>
                        <span className="me-4 text-sm">78%</span>
                    </div>
                    <div className="bg-base-200/80 flex h-8 w-full items-center justify-between rounded-full">
                        <div className="bg-success/30 flex h-8 w-[52%] items-center rounded-full ps-5 text-sm">
                            Japan
                        </div>
                        <span className="me-4 text-sm">52%</span>
                    </div>
                    <div className="bg-base-200/80 flex h-8 w-full items-center justify-between rounded-full">
                        <div className="bg-warning/30 flex h-8 w-[80%] items-center rounded-full ps-5 text-sm">
                            Germany
                        </div>
                        <span className="me-4 text-sm">80%</span>
                    </div>
                    <div className="bg-base-200/80 flex h-8 w-full items-center justify-between rounded-full">
                        <div className="bg-info/30 flex h-8 w-[45%] items-center rounded-full ps-5 text-sm">Canada</div>
                        <span className="me-4 text-sm">45%</span>
                    </div>
                    <div className="bg-base-200/80 flex h-8 w-full items-center justify-between rounded-full">
                        <div className="bg-error/30 flex h-8 w-[30%] items-center rounded-full ps-5 text-sm">
                            Brazil
                        </div>
                        <span className="me-4 text-sm">30%</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
