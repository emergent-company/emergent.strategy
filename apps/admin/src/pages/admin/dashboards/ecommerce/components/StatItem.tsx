export type IStatItem = {
    title: string;
    amount: string;
    percent: number;
    icon: string;
    lastAmount: string;
};

export const StatItem = ({ title, percent, amount, lastAmount, icon }: IStatItem) => {
    return (
        <div className="card bg-base-100 shadow">
            <div className="card-body gap-2">
                <div className="flex items-start justify-between gap-2 text-sm">
                    <div>
                        <p className="text-base-content/80 font-medium">{title}</p>
                        <div className="mt-3 flex items-center gap-2">
                            <p className="text-2xl font-semibold">{amount}</p>
                            {percent > 0 ? (
                                <div className="badge badge-soft badge-success badge-sm gap-0.5 px-1 font-medium">
                                    <span className="iconify lucide--arrow-up size-3.5" />
                                    {percent}%
                                </div>
                            ) : (
                                <div className="badge badge-soft badge-error badge-sm gap-0.5 px-1 font-medium">
                                    <span className="iconify lucide--arrow-down size-3.5" />
                                    {percent}%
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="bg-base-200 rounded-box flex items-center p-2">
                        <span className={`iconify size-5 ${icon}`} />
                    </div>
                </div>

                <p className="text-base-content/60 text-sm">
                    vs.<span className="mx-1">{lastAmount}</span>last period
                </p>
            </div>
        </div>
    );
};
