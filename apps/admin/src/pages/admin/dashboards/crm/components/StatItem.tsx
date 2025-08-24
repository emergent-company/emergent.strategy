export type IStatItem = {
    title: string;
    amount: string;
    percent: number;
    icon: string;
    selected?: boolean;
};

export const StatItem = ({ title, percent, amount, icon, selected = false }: IStatItem) => {
    return (
        <div
            className={`card bg-base-100 shadow ${selected && "from-primary shadow-primary/10 to-primary/85 text-primary-content bg-linear-to-tr shadow-md"}`}>
            <div className="card-body gap-2 p-4 2xl:p-5">
                <div className="flex items-center gap-3">
                    <div
                        className={`bg-base-200 rounded-box flex items-center p-1.5 ${selected && "bg-primary-content/15"}`}>
                        <span className={`iconify size-4.5 ${icon}`} />
                    </div>
                    <p className="line-clamp-1 font-medium max-2xl:text-sm">{title}</p>
                </div>
                <div className="mt-5 mb-0.5 flex items-center gap-2 text-sm 2xl:gap-3">
                    <p className="text-lg leading-0 font-medium 2xl:text-2xl">{amount}</p>
                    {percent > 0 ? (
                        <div
                            className={`badge badge-soft badge-success badge-sm gap-0.5 px-1.5 ${selected && "!bg-primary-content/15 !text-primary-content !border-transparent"}`}>
                            <span className="iconify lucide--arrow-up size-3" />
                            {percent}%
                        </div>
                    ) : (
                        <div
                            className={`badge badge-soft badge-error badge-sm gap-0.5 px-1.5 ${selected && "!bg-primary-content/15 !text-primary-content !border-transparent"}`}>
                            <span className="iconify lucide--arrow-down size-3" />
                            {percent}%
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
