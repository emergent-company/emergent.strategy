import type { ApexOptions } from "apexcharts";
import { Suspense, lazy, useEffect, useState } from "react";

import { LoadingEffect } from "@/components/LoadingEffect";

const ApexCharts = lazy(() => import("react-apexcharts"));

const negativeDataValues = {
    north: [319, 320, 324, 344, 345, 340, 329, 315, 325, 328],
    northeast: [227, 254, 223, 233, 262, 254, 249, 267, 302, 209],
    midwest: [147, 155, 123, 127, 157, 157, 133, 169, 199, 121],
    west: [168, 91, 48, 20, -1, -37, -88, -130, -90, -78],
};

const chartOptions: ApexOptions = {
    xaxis: {
        categories: Array.from({ length: 10 }, (_, index) => new Date().getFullYear() - index - 1).reverse(),
    },
    yaxis: {
        labels: {
            formatter: function (value) {
                return `${value < 0 ? "-" : ""}$${Math.abs(value)}K`;
            },
        },
    },
    chart: {
        type: "area",
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
    colors: ["#167bff", "#FFC470", "#67C6E3", "#FFC700"],
    fill: {
        type: "solid",
        opacity: 0.6,
    },
    stroke: {
        curve: "smooth",
        width: 1,
    },
    dataLabels: {
        enabled: false,
    },
    legend: {
        show: true,
        position: "top",
    },
    series: [
        {
            name: "North",
            data: negativeDataValues.north,
        },
        {
            name: "Northeast",
            data: negativeDataValues.northeast,
        },
        {
            name: "Midwest",
            data: negativeDataValues.midwest,
        },
        {
            name: "West",
            data: negativeDataValues.west,
        },
    ],
};

export const NegativeValueAreaChart = () => {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return <LoadingEffect height={chartOptions.chart?.height} />;

    return (
        <Suspense fallback={<LoadingEffect height={chartOptions.chart?.height} />}>
            <ApexCharts
                options={chartOptions}
                type={chartOptions.chart?.type as any}
                height={chartOptions.chart?.height}
                series={chartOptions.series}
            />
        </Suspense>
    );
};
