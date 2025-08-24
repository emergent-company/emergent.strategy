type IStatItem = {
    title: string;
    amount: string;
    percent: number;
};

const statItems: IStatItem[] = [
    {
        title: "Tokens Used",
        amount: "8.9M",
        percent: 12.3,
    },
    {
        title: "Active Users",
        amount: "4,532",
        percent: 5.7,
    },
    {
        title: "Latency (ms)",
        amount: "98",
        percent: -3.2,
    },
    {
        title: "Model Invocations",
        amount: "117K",
        percent: 9.1,
    },
];

export const MinimalStatsDemo = () => {
    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            {statItems.map((statItem, index) => {
                const { title, percent, amount } = statItem;

                return (
                    <div className="card bg-base-100 card-border" key={index}>
                        <div className="card-body">
                            <p className="text-base-content/60 text-xs font-medium tracking-wide uppercase">{title}</p>

                            <div className="mt-4 flex items-end justify-end gap-2 text-sm">
                                <p className="text-2xl/none font-semibold">{amount}</p>
                                {percent > 0 ? (
                                    <div className="text-success flex items-center gap-0.5 px-1 font-medium">
                                        <span className="iconify lucide--arrow-up size-3.5" />
                                        {percent}%
                                    </div>
                                ) : (
                                    <div className="text-error flex items-center gap-0.5 px-1 font-medium">
                                        <span className="iconify lucide--arrow-down size-3.5" />
                                        {percent}%
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
