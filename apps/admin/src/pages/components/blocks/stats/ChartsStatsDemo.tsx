import type { ApexOptions } from "apexcharts";
import ApexCharts from "react-apexcharts";

type IStatItem = {
    title: string;
    amount: string;
    percent: number;
    data: number[];
    color: string;
};
const statItems: IStatItem[] = [
    {
        title: "Total Sales",
        amount: "$189K",
        percent: 14.8,
        data: [120, 150, 180, 160, 200, 230, 210, 250],
        color: "#4caf50",
    },
    {
        title: "New Customers",
        amount: "1,245",
        percent: 7.2,
        data: [80, 90, 100, 95, 110, 130, 125, 140],
        color: "#6c74f8",
    },
    {
        title: "Churn Rate",
        amount: "2.8%",
        percent: -1.5,
        data: [3.2, 3.1, 3.0, 2.9, 3.1, 3.0, 2.8, 2.8],
        color: "#f44336",
    },
    {
        title: "Revenue Growth",
        amount: "23%",
        percent: 5.4,
        data: [15, 18, 20, 22, 21, 23, 24, 25],
        color: "#ff8b4b",
    },
];

const baseChartOptions: ApexOptions = {
    chart: {
        height: 28,
        type: "line",
        background: "transparent",
        toolbar: { show: false },
        sparkline: {
            enabled: true,
        },
    },
    stroke: {
        curve: "smooth",
        width: 2,
    },
    dataLabels: { enabled: false },
    legend: {
        show: false,
    },
    xaxis: {
        categories: ["Feb 19", "Feb 20", "Feb 21", "Feb 22", "Feb 23", "Feb 24", "Feb 25", "Feb 26"],
        axisBorder: {
            show: false,
        },
        labels: {
            show: false,
        },
        axisTicks: {
            show: false,
        },
    },
    yaxis: {
        labels: { show: false },
        axisBorder: { show: false },
        show: false,
        axisTicks: { show: false },
    },
    tooltip: {
        enabled: true,
        shared: true,
        intersect: false,
    },
    grid: { show: false },
};

export const ChartsStatsDemo = () => {
    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            {statItems.map((statItem, index) => {
                const { title, percent, amount, data, color } = statItem;

                const chartOptions: ApexOptions = {
                    ...baseChartOptions,
                    colors: [color],
                    yaxis: {
                        ...baseChartOptions.yaxis,
                        min: Math.min(...data) * 0.85,
                        max: Math.max(...data) * 1.15,
                    },
                    series: [
                        {
                            name: title,
                            data,
                        },
                    ],
                };

                return (
                    <div className="card bg-base-100 card-border" key={index}>
                        <div className="card-body">
                            <div className="flex justify-between gap-2 text-xs">
                                <p className="text-base-content/60 font-medium tracking-wide uppercase">{title}</p>
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
                            <div className="mt-2 flex items-end gap-2">
                                <p className="grow text-2xl/none font-semibold">{amount}</p>
                                <div className="w-24">
                                    <ApexCharts
                                        options={chartOptions}
                                        height={chartOptions.chart?.height}
                                        width={chartOptions.chart?.width}
                                        type={chartOptions.chart?.type}
                                        series={chartOptions.series}></ApexCharts>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
