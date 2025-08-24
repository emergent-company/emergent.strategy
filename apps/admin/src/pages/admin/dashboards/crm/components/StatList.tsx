import { useState } from "react";

import { IStatItem, StatItem } from "./StatItem";

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

export const StatList = () => {
    const [selected, setSelected] = useState<IStatItem | undefined>(statItems[1]);

    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-1">
            {statItems.map((state, index) => (
                <div className="cursor-pointer" onClick={() => setSelected(state)} key={index}>
                    <StatItem {...state} selected={selected == state} />
                </div>
            ))}
        </div>
    );
};
