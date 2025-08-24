import type { ApexOptions } from "apexcharts";
import { Suspense, lazy, useEffect, useState } from "react";

import { LoadingEffect } from "@/components/LoadingEffect";

const ApexCharts = lazy(() => import("react-apexcharts"));
const seriesData = [50, 30, 40, 20, 25, 15, 10];
const chartOptions: ApexOptions = {
    chart: {
        type: "donut",
        height: 380,
        toolbar: {
            show: false,
        },
        background: "transparent",
    },
    title: {
        text: "Marketing Budget",
        style: { fontWeight: "500" },
        align: "right",
    },
    stroke: {
        show: true,
        width: 1,
        colors: ["var(--color-base-100)"],
    },
    fill: {
        type: "gradient",
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
                        formatter: (value) => `${value}K`,
                        color: "var(--color-base-content)",
                    },
                    total: {
                        show: true,
                        color: "#FF4560",
                        formatter: () => `${seriesData.reduce((acc, cur) => acc + cur, 0)}K`,
                    },
                },
            },
        },
    },
    tooltip: {
        enabled: true,
        y: {
            formatter: (value) => `${value}K`,
        },
    },
    responsive: [
        {
            breakpoint: 480,
            options: {
                chart: {
                    width: 200,
                },
                legend: {
                    position: "bottom",
                },
            },
        },
    ],
    labels: ["Content", "Social Media", "SEO", "Paid Display", "Affiliate", "Magazine", "Promotional Items"],
    colors: ["#167bff", "#FDA403", "#FB6D48", "#A25772", "#8E7AB5", "#FFA299", "#E3C878"],
    series: seriesData,
};

export const GradientDonutChart = () => {
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
