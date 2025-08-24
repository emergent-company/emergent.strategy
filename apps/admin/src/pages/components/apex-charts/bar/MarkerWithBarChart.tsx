import type { ApexOptions } from "apexcharts";
import { Suspense, lazy, useEffect, useState } from "react";

import { LoadingEffect } from "@/components/LoadingEffect";

const ApexCharts = lazy(() => import("react-apexcharts"));

const data = [
    {
        y: 488,
        goals: {
            name: "Predicted Sales",
            value: 680,
            strokeDashArray: 2,
        },
    },
    {
        y: 680,
        goals: {
            name: "Predicted Sales",
            value: 710,
            strokeDashArray: 2,
        },
    },
    {
        y: 722,
        goals: {
            name: "Predicted Sales",
            value: 680,
        },
    },
    {
        y: 539,
        goals: {
            name: "Predicted Sales",
            value: 594,
            strokeDashArray: 2,
        },
    },
    {
        y: 461,
        goals: {
            name: "Predicted Sales",
            value: 397,
        },
    },
    {
        y: 322,
        goals: {
            name: "Predicted Sales",
            value: 300,
        },
    },
];
const currentYear = new Date().getFullYear();
const seriesWithGoals = data.map((data, index) => ({
    ...data,
    x: (currentYear - index).toString(),
    goals: [{ ...data.goals, strokeWidth: 6, strokeColor: "#EB6440" }],
}));

const chartOptions: ApexOptions = {
    xaxis: {
        type: "numeric",
        title: { text: "(Million USD)", style: { fontWeight: "500" } },
        labels: {
            formatter: (value) => value + "M",
        },
    },
    tooltip: {
        y: {
            formatter: (value) => value + "M",
        },
    },
    grid: {
        show: false,
    },
    chart: {
        type: "bar",
        height: 380,
        toolbar: {
            show: true,
        },
        background: "transparent",
    },
    colors: ["#167bff"],
    fill: {
        type: "solid",
    },
    legend: {
        show: true,
        showForSingleSeries: true,
    },
    plotOptions: {
        bar: {
            horizontal: true,
            barHeight: 28,
        },
    },
    series: [
        {
            name: "Total Sales",
            data: seriesWithGoals,
        },
    ],
};

export const MarkerWithBarChart = () => {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return <LoadingEffect height={chartOptions.chart?.height} />;

    return (
        <Suspense fallback={<LoadingEffect height={chartOptions.chart?.height} />}>
            <ApexCharts
                options={chartOptions}
                type={chartOptions.chart?.type}
                height={chartOptions.chart?.height}
                series={chartOptions.series}
            />
        </Suspense>
    );
};
