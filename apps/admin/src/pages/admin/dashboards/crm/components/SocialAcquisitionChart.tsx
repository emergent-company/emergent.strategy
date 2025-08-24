import type { ApexOptions } from "apexcharts";
import { Suspense, lazy, useEffect, useState } from "react";

import { LoadingEffect } from "@/components/LoadingEffect";

const ApexCharts = lazy(() => import("react-apexcharts"));

const series = [
    {
        name: "Twitter",
        data: [
            {
                x: "Mon",
                y: 39,
            },
            {
                x: "Tue",
                y: 14,
            },
            {
                x: "Wed",
                y: 22,
            },
            {
                x: "Thu",
                y: 45,
            },
            {
                x: "Fri",
                y: 10,
            },
            {
                x: "Sat",
                y: 27,
            },
            {
                x: "Sun",
                y: 66,
            },
        ],
    },
    {
        name: "Youtube",
        data: [
            {
                x: "Mon",
                y: 13,
            },
            {
                x: "Tue",
                y: 19,
            },
            {
                x: "Wed",
                y: 11,
            },
            {
                x: "Thu",
                y: 40,
            },
            {
                x: "Fri",
                y: 17,
            },
            {
                x: "Sat",
                y: 58,
            },
            {
                x: "Sun",
                y: 27,
            },
        ],
    },
    {
        name: "Instagram",
        data: [
            {
                x: "Mon",
                y: 48,
            },
            {
                x: "Tue",
                y: 41,
            },
            {
                x: "Wed",
                y: 24,
            },
            {
                x: "Thu",
                y: 14,
            },
            {
                x: "Fri",
                y: 40,
            },
            {
                x: "Sat",
                y: 41,
            },
            {
                x: "Sun",
                y: 33,
            },
        ],
    },
    {
        name: "Whatsapp",
        data: [
            {
                x: "Mon",
                y: 37,
            },
            {
                x: "Tue",
                y: 30,
            },
            {
                x: "Wed",
                y: 48,
            },
            {
                x: "Thu",
                y: 49,
            },
            {
                x: "Fri",
                y: 40,
            },
            {
                x: "Sat",
                y: 46,
            },
            {
                x: "Sun",
                y: 27,
            },
        ],
    },
    {
        name: "Facebook",
        data: [
            {
                x: "Mon",
                y: 36,
            },
            {
                x: "Tue",
                y: 10,
            },
            {
                x: "Wed",
                y: 48,
            },
            {
                x: "Thu",
                y: 49,
            },
            {
                x: "Fri",
                y: 45,
            },
            {
                x: "Sat",
                y: 56,
            },
            {
                x: "Sun",
                y: 20,
            },
        ],
    },
];

const chartOptions: ApexOptions = {
    series: series,
    chart: {
        height: 298,
        type: "heatmap",
        background: "transparent",
        toolbar: {
            show: false,
        },
    },
    stroke: {
        width: 6,
        colors: ["var(--color-base-100)"],
    },
    plotOptions: {
        heatmap: {
            radius: 6,
        },
    },
    dataLabels: {
        enabled: false,
    },
    grid: {
        show: false,
        padding: {
            top: -20,
            bottom: -6,
        },
    },
    xaxis: {
        type: "category",
        axisTicks: { show: false },
        axisBorder: {
            show: false,
        },
    },
    colors: ["#167bff"],
};

export const SocialAcquisitionChart = () => {
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
