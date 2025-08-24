import type { ApexOptions } from "apexcharts";
import { Suspense, lazy, useEffect, useState } from "react";

import { LoadingEffect } from "@/components/LoadingEffect";

const ApexCharts = lazy(() => import("react-apexcharts"));

const chartOptions: ApexOptions = {
    chart: {
        height: 288,
        type: "bar",
        stacked: true,
        background: "transparent",
        toolbar: {
            show: false,
        },
    },
    plotOptions: {
        bar: {
            borderRadius: 8,
            borderRadiusApplication: "end",
            borderRadiusWhenStacked: "last",
            colors: {
                backgroundBarColors: ["rgba(150,150,150,0.07)"],
                backgroundBarRadius: 8,
            },
            columnWidth: "45%",
            barHeight: "100%",
        },
    },
    dataLabels: {
        enabled: false,
    },
    colors: ["#ff8b4b", "#6c74f8"],
    legend: {
        show: true,
        horizontalAlign: "center",
        offsetX: 0,
        offsetY: 6,
    },
    series: [
        {
            name: "Orders",
            data: [10, 12, 14, 16, 18, 20, 14, 16, 24, 12],
        },
        {
            name: "Revenue",
            data: [15, 24, 21, 28, 30, 40, 22, 32, 48, 20],
        },
    ],
    xaxis: {
        categories: [
            new Date("1/1/2016"),
            new Date("1/1/2017"),
            new Date("1/1/2018"),
            new Date("1/1/2019"),
            new Date("1/1/2020"),
            new Date("1/1/2021"),
            new Date("1/1/2022"),
            new Date("1/1/2023"),
            new Date("1/1/2024"),
            new Date("1/1/2025"),
        ],
        axisBorder: {
            show: false,
        },
        axisTicks: {
            show: false,
        },
        labels: {
            formatter: (val) => {
                return new Date(val).getFullYear().toString();
            },
        },
    },
    yaxis: {
        axisBorder: {
            show: false,
        },
        axisTicks: {
            show: false,
        },
        labels: {
            show: false,
        },
    },
    tooltip: {
        enabled: true,
        shared: true,
        intersect: false,
    },
    grid: {
        show: false,
    },
    responsive: [
        {
            breakpoint: 450,
            options: {
                plotOptions: {
                    bar: {
                        borderRadius: 4,
                    },
                },
                xaxis: {
                    tickAmount: 3,
                },
            },
        },
    ],
};

export const RevenueStatisticChart = () => {
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
