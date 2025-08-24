import { useState } from "react";

import { RevenueStatisticChart } from "./RevenueStatisticChart";

export const RevenueStatisticCard = () => {
    const [duration, setDuration] = useState<"day" | "month" | "year">("year");

    return (
        <div className="card bg-base-100 shadow">
            <div className="card-body px-0 pb-0">
                <div className="px-6">
                    <div className="flex items-start justify-between">
                        <span className="font-medium">Revenue Statistics</span>
                        <div className="tabs tabs-box tabs-xs hidden sm:block">
                            <div
                                className={`tab px-3 ${duration === "day" && "tab-active"}`}
                                onClick={() => setDuration("day")}>
                                Day
                            </div>
                            <div
                                className={`tab px-3 ${duration === "month" && "tab-active"}`}
                                onClick={() => setDuration("month")}>
                                Month
                            </div>
                            <div
                                className={`tab px-3 ${duration === "year" && "tab-active"}`}
                                onClick={() => setDuration("year")}>
                                Year
                            </div>
                        </div>
                    </div>
                    <div className="mt-3">
                        {duration == "day" && (
                            <>
                                <div className="flex items-center gap-3">
                                    <span className="text-4xl font-semibold">$627</span>
                                    <span className="text-success font-medium">+2.14%</span>
                                </div>
                                <span className="text-base-content/60 text-sm">Total income for today</span>
                            </>
                        )}
                        {duration == "month" && (
                            <>
                                <div className="flex items-center gap-3">
                                    <span className="text-4xl font-semibold">$16,421</span>
                                    <span className="text-success font-medium">+4.59%</span>
                                </div>
                                <span className="text-base-content/60 text-sm">Total income in this month</span>
                            </>
                        )}
                        {duration == "year" && (
                            <>
                                <div className="flex items-center gap-3">
                                    <span className="text-4xl font-semibold">$184.78K</span>
                                    <span className="text-success font-medium">+3.24%</span>
                                </div>
                                <span className="text-base-content/60 text-sm">Total income in this year</span>
                            </>
                        )}
                    </div>
                </div>
                <div>
                    <RevenueStatisticChart />
                </div>
            </div>
        </div>
    );
};
