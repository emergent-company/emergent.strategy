import type { ApexOptions } from "apexcharts";
import { Suspense, lazy, useEffect, useState } from "react";

import { LoadingEffect } from "@/components/LoadingEffect";

const ApexCharts = lazy(() => import("react-apexcharts"));

const xAxisLabels = [
    "Sep 21-30",
    "Oct 1-10",
    "Oct 11-20",
    "Oct 21-31",
    "Nov 1-10",
    "Nov 11-20",
    "Nov 21-30",
    "Dec 1-10",
];

const chartOptions: ApexOptions = {
    chart: {
        type: "line",
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
    },
    xaxis: {
        categories: xAxisLabels,
        title: {
            text: "Sales",
            style: { fontWeight: "500" },
        },
    },
    yaxis: {
        labels: {
            formatter: (val) => val.toFixed(0) + "K",
        },
    },
    tooltip: {
        y: {
            formatter: (val) => `$${val}K`,
        },
    },
    annotations: {
        yaxis: [
            {
                y: 202,
                strokeDashArray: 0,
                borderColor: "#FDA403",
                label: {
                    style: {
                        color: "#fff",
                        background: "#FDA403",
                    },
                    text: "Target",
                    borderWidth: 0,
                },
            },
        ],
        xaxis: [
            {
                x: xAxisLabels[2],
                strokeDashArray: 0,
                borderColor: "#A25772",
                label: {
                    style: {
                        color: "#fff",
                        background: "#A25772",
                    },
                    text: "Start Of Sale",
                    borderWidth: 0,
                },
            },
            {
                x: xAxisLabels[4],
                x2: xAxisLabels[5],
                strokeDashArray: 0,
                borderColor: "#8E7AB5",
                label: {
                    style: {
                        color: "#fff",
                        background: "#8E7AB5",
                    },
                    text: "Festive Season",
                    borderWidth: 0,
                },
            },
        ],
        points: [
            {
                x: xAxisLabels[6],
                y: 196.78,
                marker: {
                    size: 6,
                    fillColor: "#FF4560",
                    strokeColor: "FF4560",
                },
                label: {
                    borderColor: "#FF4560",
                    offsetY: 36,
                    style: {
                        color: "#fff",
                        background: "#FF4560",
                    },
                    borderWidth: 0,
                    text: "Production Down",
                },
            },
        ],
    },
    stroke: {
        curve: "smooth",
        width: 2,
    },
    colors: ["#167bff"],
    series: [
        {
            name: "Sales",
            data: [114.87, 105.88, 90.58, 135.43, 86.39, 212.99, 196.78, 143.76],
        },
    ],
};

export const AnnotationLineChart = () => {
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
