import { useState } from "react";

type IStatItem = {
    title: string;
    amount: string;
    percent: number;
    icon: string;
    selected?: boolean;
};

const statItems: IStatItem[] = [
    {
        title: "Customers",
        amount: "4,235",
        percent: 8.04,
        icon: "lucide--users",
    },
    {
        title: "Revenue",
        amount: "$75,400",
        percent: 15.3,
        icon: "lucide--dollar-sign",
    },
    {
        title: "Closed Deals",
        amount: "574",
        percent: -2.4,
        icon: "lucide--handshake",
    },
    {
        title: "Satisfaction",
        amount: "93%",
        percent: 2.3,
        icon: "lucide--smile",
    },
];

export const CRMStatsDemo = () => {
    const [selected, setSelected] = useState<IStatItem | undefined>(statItems[1]);

    return (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 2xl:grid-cols-4">
            {statItems.map((statItem, index) => {
                const { title, percent, amount, icon } = statItem;

                const isSelected = statItem === selected;

                return (
                    <div
                        key={index}
                        onClick={() => setSelected(statItem)}
                        className={`card cursor-pointer bg-linear-to-tr shadow ${isSelected ? "shadow-primary/10 to-primary/75 text-primary-content from-primary" : "to-base-100 from-base-100"}`}>
                        <div className="card-body gap-2 p-3 2xl:p-4">
                            <div className="flex items-center gap-3">
                                <div
                                    className={`bg-base-200 rounded-box flex items-center p-1.5 ${isSelected && "bg-primary-content/15"}`}>
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
            })}
        </div>
    );
};
