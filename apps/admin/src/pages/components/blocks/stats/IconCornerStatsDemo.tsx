type IStatItem = {
    title: string;
    amount: string;
    percent: number;
    icon: string;
};

const statItems: IStatItem[] = [
    {
        title: "Prompts Generated",
        amount: "9.2M",
        percent: 14.6,
        icon: "lucide--zap",
    },
    {
        title: "New Paid Users",
        amount: "3,124",
        percent: 7.8,
        icon: "lucide--badge-check",
    },
    {
        title: "API Requests",
        amount: "174.6K",
        percent: 11.2,
        icon: "lucide--terminal-square",
    },
    {
        title: "Avg. Response Time",
        amount: "87 ms",
        percent: -4.1,
        icon: "lucide--gauge-circle",
    },
];

export const IconCornerStatsDemo = () => {
    return (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 2xl:grid-cols-4">
            {statItems.map((statItem, index) => {
                const { title, percent, amount, icon } = statItem;

                return (
                    <div className="card bg-base-100 relative shadow" key={index}>
                        <div className="card-body gap-2">
                            <p className="inline text-2xl/none font-semibold">{amount}</p>

                            <p className="text-base-content/60 mt-1 text-sm font-medium">{title}</p>

                            <div className="mt-5 flex items-center gap-2">
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
                                <p className="text-base-content/60 text-sm">compared to week</p>
                            </div>
                        </div>
                        <div className="to-base-200/60 absolute -end-3 -top-3 rounded-full bg-linear-to-bl from-transparent p-1.5">
                            <div className="bg-base-100 flex items-center justify-center rounded-full p-2 shadow">
                                <span className={`iconify size-6 ${icon}`} />
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
