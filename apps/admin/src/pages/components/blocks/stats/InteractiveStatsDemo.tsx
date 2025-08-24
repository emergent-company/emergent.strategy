type IStatItem = {
    title: string;
    amount: string;
    percent: number;
    time: string;
    icon: string;
};

const statItems: IStatItem[] = [
    {
        title: "MRR",
        amount: "$82,450",
        percent: 5.2,
        time: "30d",
        icon: "lucide--dollar-sign",
    },
    {
        title: "Churn",
        amount: "2.4%",
        percent: -0.6,
        time: "30d",
        icon: "lucide--user-minus",
    },
    {
        title: "New Users",
        amount: "1,920",
        percent: 8.1,
        time: "7d",
        icon: "lucide--user-plus",
    },
    {
        title: "Active Teams",
        amount: "734",
        percent: 3.9,
        time: "7d",
        icon: "lucide--users",
    },
];

export const InteractiveStatsDemo = () => {
    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            {statItems.map((statItem, index) => {
                const { title, percent, amount } = statItem;

                return (
                    <div className="card bg-base-100 group card-border relative" key={index}>
                        <div className="card-body">
                            <div className="flex items-center justify-between gap-2">
                                <span className={`iconify size-4 ${statItem.icon}`}></span>
                                <p className="text-base-content/80">{title}</p>
                            </div>
                            <p className="mt-2 text-2xl/none font-semibold">{amount}</p>
                            <div className="mt-4 flex items-center gap-1 text-sm">
                                {percent > 0 ? (
                                    <div className="text-success flex items-center gap-1 px-1 font-medium">
                                        <span className="iconify lucide--arrow-up size-3.5 -rotate-45" />
                                        {percent}%
                                    </div>
                                ) : (
                                    <div className="text-error flex items-center gap-0.5 px-1 font-medium">
                                        <span className="iconify lucide--arrow-down size-3.5 -rotate-45" />
                                        {percent}%
                                    </div>
                                )}
                                <p className="text-base-content/50">({statItem.time})</p>
                            </div>
                        </div>
                        <div className="rounded-box border-base-300 absolute end-3 top-3 flex origin-right scale-80 items-center p-0.5 opacity-0 shadow transition-all duration-300 group-hover:scale-100 group-hover:opacity-100">
                            <button className="btn btn-ghost btn-xs btn-square" aria-label="Edit">
                                <span className="iconify lucide--pencil size-3.5"></span>
                            </button>
                            <button className="btn btn-ghost btn-xs btn-square" aria-label="Move">
                                <span className="iconify lucide--arrow-left-right size-3.5"></span>
                            </button>
                            <button
                                className="btn btn-ghost btn-error text-error hover:text-error-content btn-xs btn-square"
                                aria-label="Delete">
                                <span className="iconify lucide--trash-2 size-3.5"></span>
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
