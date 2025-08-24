type IStatItem = {
    title: string;
    amount: string;
    percent: number;
    icon: string;
    lastAmount: string;
};

const statItems: IStatItem[] = [
    {
        title: "Revenue",
        amount: "$587.54",
        percent: 10.8,
        icon: "lucide--circle-dollar-sign",
        lastAmount: "$494.16",
    },
    {
        title: "Sales",
        amount: "4500",
        percent: 21.2,
        icon: "lucide--package",
        lastAmount: "3845",
    },
    {
        title: "Customers",
        amount: "2242",
        percent: -6.8,
        icon: "lucide--users",
        lastAmount: "2448",
    },
    {
        title: "Spending",
        amount: "$112.54",
        percent: 8.5,
        icon: "lucide--eraser",
        lastAmount: "$98.14",
    },
];

export const EcommerceStatsDemo = () => {
    return (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 2xl:grid-cols-4">
            {statItems.map((statItem, index) => {
                const { title, percent, amount, lastAmount, icon } = statItem;

                return (
                    <div className="card bg-base-100 shadow" key={index}>
                        <div className="card-body gap-2 p-4">
                            <div className="flex items-start justify-between gap-2 text-sm">
                                <div>
                                    <p className="text-base-content/60 font-medium">{title}</p>
                                    <div className="mt-3 flex items-center gap-2">
                                        <p className="inline text-2xl font-semibold">{amount}</p>
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
                                <div className="bg-base-200 rounded-box flex items-center p-1.5">
                                    <span className={`iconify size-4.5 ${icon}`} />
                                </div>
                            </div>

                            <p className="text-base-content/60 text-sm">
                                vs.<span className="mx-1">{lastAmount}</span>last period
                            </p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
