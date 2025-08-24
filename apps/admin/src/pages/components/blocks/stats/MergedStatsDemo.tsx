type IStatItem = {
    title: string;
    amount: string;
    percent: number;
    icon: string;
};

const statItems: IStatItem[] = [
    {
        title: "Articles Published",
        amount: "1,284",
        percent: 6.2,
        icon: "lucide--file-text",
    },
    {
        title: "Search Queries",
        amount: "86.7K",
        percent: 9.5,
        icon: "lucide--search",
    },
    {
        title: "User Feedback",
        amount: "3,210",
        percent: 4.3,
        icon: "lucide--message-square",
    },
    {
        title: "Bounce Rate",
        amount: "38.2%",
        percent: -2.1,
        icon: "lucide--trending-down",
    },
];

export const MergedStatsDemo = () => {
    return (
        <div className="bg-base-100 rounded-box grid grid-cols-1 gap-4 shadow sm:grid-cols-2 2xl:grid-cols-4">
            {statItems.map((statItem, index) => {
                const { title, percent, amount, icon } = statItem;

                return (
                    <div className="group relative py-6" key={index}>
                        <div className="bg-base-200 rounded-box absolute inset-3 scale-80 opacity-0 transition-all duration-300 group-hover:scale-100 group-hover:opacity-30"></div>

                        <div className="relative flex flex-col items-center">
                            <div className="bg-base-100 flex items-center justify-center rounded-full p-2.5 shadow">
                                <span className={`iconify size-5 ${icon}`} />
                            </div>
                            <p className="mt-3 text-2xl font-semibold">{amount}</p>

                            <p className="text-base-content/60 text-sm font-medium">{title}</p>

                            <div className="mt-1">
                                {percent > 0 ? (
                                    <div className="text-success flex items-center gap-1 font-medium">
                                        <span className="iconify lucide--arrow-up size-3.5" />
                                        {percent}%
                                    </div>
                                ) : (
                                    <div className="text-error flex items-center gap-1 font-medium">
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
