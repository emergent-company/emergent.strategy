export type IStatItem = {
    icon: string;
    name: string;
    used: number;
    total: number;
    progressClass: string;
};

const statItems: IStatItem[] = [
    {
        icon: "lucide--folder",
        name: "Projects",
        used: 65.5,
        total: 125,
        progressClass: "progress-primary",
    },
    {
        icon: "lucide--image",
        name: "Media",
        used: 42,
        total: 80,
        progressClass: "progress-warning",
    },
    {
        icon: "lucide--file-text",
        name: "Documents",
        used: 91,
        total: 100,
        progressClass: "progress-error",
    },
    {
        icon: "lucide--trash-2",
        name: "Trash",
        used: 18,
        total: 40,
        progressClass: "progress-info",
    },
];

export const FileStatsDemo = () => {
    return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
            {statItems.map((statItem, index) => {
                const { progressClass, name, used, total, icon } = statItem;

                return (
                    <div className="card bg-base-100 cursor-pointer shadow transition-all hover:shadow-md" key={index}>
                        <div className="p-4">
                            <div className="bg-base-200 rounded-box inline-flex items-center justify-center p-2">
                                <span className={`iconify size-5 ${icon}`} />
                            </div>
                            <div className="mt-3 flex items-center justify-between">
                                <p className="text-sm font-medium">{name}</p>
                                <span className="text-base-content/80 text-xs">{(used * 100) / total}%</span>
                            </div>
                            <progress
                                max={total}
                                value={used}
                                className={`progress ${progressClass} mt-0.5 h-1.5 align-super`}
                            />
                            <div className="-mt-1.5 flex items-center justify-between">
                                <span className="text-sm font-medium">{used} GB</span>
                                <span className="text-base-content/80 text-xs">{total} GB</span>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
