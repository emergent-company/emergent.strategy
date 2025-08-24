import type { ApexOptions } from "apexcharts";
import { Suspense, lazy, useEffect, useState } from "react";

import { LoadingEffect } from "@/components/LoadingEffect";

const ApexCharts = lazy(() => import("react-apexcharts"));

const data = [
    {
        name: "Turkey",
        orders: 9,
    },
    {
        name: "India",
        orders: 12,
    },
    {
        name: "Canada",
        orders: 13,
    },
    {
        name: "US",
        orders: 16,
    },
    {
        name: "Netherlands",
        orders: 14,
    },
    {
        name: "Italy",
        orders: 17,
    },
    {
        name: "Other",
        orders: 19,
    },
];

const chartOptions: ApexOptions = {
    chart: {
        height: 344,
        type: "bar",
        parentHeightOffset: 0,
        background: "transparent",
        toolbar: {
            show: false,
        },
    },
    plotOptions: {
        bar: {
            horizontal: true,
            borderRadius: 4,
            distributed: true,
            borderRadiusApplication: "end",
        },
    },
    dataLabels: {
        enabled: true,
        textAnchor: "start",
        style: {
            colors: ["#fff"],
        },
        formatter: function (val, opt) {
            return opt.w.globals.labels[opt.dataPointIndex] + ":  " + val;
        },
        offsetX: -10,
        dropShadow: {
            enabled: false,
        },
    },
    series: [
        {
            data: data.map((country) => country.orders),
        },
    ],
    legend: {
        show: false,
    },
    stroke: {
        width: 0,
        colors: ["#fff"],
    },
    xaxis: {
        categories: data.map((country) => country.name),
    },
    yaxis: {
        labels: {
            show: false,
        },
    },
    grid: {
        show: false,
    },

    tooltip: {
        theme: "dark",
        x: {
            show: false,
        },
        y: {
            formatter: (val: number) => `${val}%`,
        },
    },
    colors: ["#7179ff", "#4bcd89", "#ff6c88", "#5cb7ff", "#9071ff", "#ff5892", "#ff8b4b"],
};

export const GlobalSaleChart = () => {
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
