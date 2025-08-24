export type IStatItem = {
    image: string;
    name: string;
    used: number;
    total: number;
    progressClass: string;
};

export const StatItem = ({ image, name, used, total, progressClass }: IStatItem) => {
    return (
        <div className="card bg-base-100 cursor-pointer shadow transition-all hover:shadow-md">
            <div className="card-body p-4">
                <div className="bg-base-200 rounded-box w-fit p-2">
                    <img src={image} className="size-6" alt="" />
                </div>
                <div className="mt-3 flex items-center justify-between">
                    <p className="text-sm font-medium">{name}</p>
                    <span className="text-base-content/80 text-xs">{(used * 100) / total}%</span>
                </div>
                <progress max={total} value={used} className={`progress ${progressClass} mt-1.5 h-1.5`} />
                <div className="mt-1.5 flex items-center justify-between">
                    <span className="text-sm font-medium">{used} GB</span>
                    <span className="text-base-content/80 text-xs">{total} GB</span>
                </div>
            </div>
        </div>
    );
};
