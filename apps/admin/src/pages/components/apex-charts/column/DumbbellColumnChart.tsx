import type { ApexOptions } from "apexcharts";
import { Suspense, lazy, useEffect, useState } from "react";

import { LoadingEffect } from "@/components/LoadingEffect";

const ApexCharts = lazy(() => import("react-apexcharts"));

const chartOptions: ApexOptions = {
    xaxis: {
        tickPlacement: "on",
        title: {
            text: "Average Delivery Time (Days)",
            style: { fontWeight: "500" },
        },
    },
    yaxis: {
        min: 0,
        max: 10,
    },
    grid: {
        xaxis: {
            lines: {
                show: true,
            },
        },
        yaxis: {
            lines: {
                show: false,
            },
        },
    },
    chart: {
        height: 380,
        toolbar: {
            show: true,
            tools: {
                download: true,
                zoom: false,
                zoomin: false,
                zoomout: false,
                pan: false,
                reset: false,
            },
        },
        background: "transparent",
        type: "rangeBar",
    },
    fill: {
        type: "gradient",
        gradient: {
            type: "vertical",
            gradientToColors: ["#FB6D48"],
            inverseColors: true,
            stops: [0, 100],
        },
    },
    plotOptions: {
        bar: {
            columnWidth: 3,
            isDumbbell: true,
            dumbbellColors: [["#167bff", "#FB6D48"]],
        },
    },
    labels: ["Min Delivery Days", "Max Delivery Days"],
    legend: {
        show: true,
        showForSingleSeries: true,
        position: "bottom",
        horizontalAlign: "center",
        customLegendItems: ["Min Delivery Days", "Max Delivery Days"],
        markers: {
            fillColors: ["#167bff", "#FB6D48"],
        },
    },
    series: [
        {
            data: [
                {
                    x: "California",
                    y: [2, 4],
                },
                {
                    x: "Nevada",
                    y: [2, 5],
                },
                {
                    x: "New York",
                    y: [1, 2],
                },
                {
                    x: "Arizona",
                    y: [1, 4],
                },
                {
                    x: "Vermont",
                    y: [2, 9],
                },
                {
                    x: "Texas",
                    y: [3, 6],
                },
                {
                    x: "Ohio",
                    y: [4, 7],
                },
                {
                    x: "Tennessee",
                    y: [2, 8],
                },
            ],
        },
    ],
};

export const DumbbellColumnChart = () => {
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
