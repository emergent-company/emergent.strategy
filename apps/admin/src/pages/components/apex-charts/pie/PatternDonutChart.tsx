import type { ApexOptions } from "apexcharts";
import { Suspense, lazy, useEffect, useState } from "react";

import { LoadingEffect } from "@/components/LoadingEffect";

const ApexCharts = lazy(() => import("react-apexcharts"));

const seriesData = [2512, 1003, 2009, 4322, 521];
const chartOptions: ApexOptions = {
    chart: {
        type: "donut",
        height: 380,
        toolbar: {
            show: false,
        },
        background: "transparent",
        dropShadow: {
            enabled: true,
            color: "#111",
            top: -1,
            left: 3,
            blur: 3,
            opacity: 0.2,
        },
    },
    title: {
        text: "Inventory",
        style: { fontWeight: "500" },
        align: "right",
        offsetX: -24,
    },
    legend: {
        position: "right",
    },
    stroke: {
        show: true,
        width: 1,
        colors: ["var(--color-base-100)"],
    },
    fill: {
        type: "pattern",
        pattern: {
            style: ["squares", "verticalLines", "slantedLines", "circles", "horizontalLines"],
            width: 4,
            height: 4,
            strokeWidth: 1,
        },
    },
    plotOptions: {
        pie: {
            startAngle: -45,
            endAngle: 315,
            donut: {
                size: "60%",
                labels: {
                    show: true,
                    value: {
                        color: "var(--color-base-content)",
                        formatter: (value) => value + " Units",
                    },
                    total: {
                        show: true,
                        color: "#FF4560",
                        formatter: () => seriesData.reduce((acc, cur) => acc + cur, 0) + " Units",
                    },
                },
            },
        },
    },
    tooltip: {
        enabled: true,
        y: {
            formatter: (value) => value + " Units",
        },
    },
    labels: ["Smartwatch", "Smartphone", "Tablet", "Headphone", "Laptop"],
    colors: ["#167bff", "#FB6D48", "#FDA403", "#A25772", "#8E7AB5"],
    series: seriesData,
};

export const PatternDonutChart = () => {
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
