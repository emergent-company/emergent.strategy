import type { ApexOptions } from "apexcharts";
import { Suspense, lazy, useEffect, useState } from "react";

import { LoadingEffect } from "@/components/LoadingEffect";

const ApexCharts = lazy(() => import("react-apexcharts"));

const dataA = [
    {
        x: new Date("1/1/2025"),
        y: 150,
    },
    {
        x: new Date("1/2/2025"),
        y: 160,
    },
    {
        x: new Date("1/3/2025"),
        y: 145,
    },
    {
        x: new Date("1/4/2025"),
        y: 155,
    },
    {
        x: new Date("1/5/2025"),
        y: 160,
    },
    {
        x: new Date("1/6/2025"),
        y: 150,
    },
    {
        x: new Date("1/7/2025"),
        y: 142,
    },
    {
        x: new Date("1/8/2025"),
        y: 160,
    },
    {
        x: new Date("1/9/2025"),
        y: 148,
    },
];

const dataB = [
    {
        x: new Date("1/5/2025"),
        y: 180,
    },
    {
        x: new Date("1/6/2025"),
        y: 186,
    },
    {
        x: new Date("1/7/2025"),
        y: 200,
    },
    {
        x: new Date("1/8/2025"),
        y: 175,
    },
    {
        x: new Date("1/9/2025"),
        y: 188,
    },
    {
        x: new Date("1/10/2025"),
        y: 195,
    },
    {
        x: new Date("1/11/2025"),
        y: 185,
    },
];

const dataC = [
    {
        x: new Date("1/4/2025"),
        y: 120,
    },
    {
        x: new Date("1/5/2025"),
        y: 135,
    },
    {
        x: new Date("1/6/2025"),
        y: 115,
    },
    {
        x: new Date("1/7/2025"),
        y: 125,
    },
    {
        x: new Date("1/8/2025"),
        y: 130,
    },
];

const chartOptions: ApexOptions = {
    chart: {
        type: "area",
        height: 380,
        stacked: false,
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
        type: "datetime",
        labels: {
            datetimeUTC: false,
        },
    },
    yaxis: {
        min: 30,
    },
    tooltip: {
        x: {
            format: "dd MMM yyyy",
        },
        y: {
            formatter: (value) => value + " points",
        },
    },
    colors: ["#3e5eff", "#FFC700", "#FFAD84"],
    fill: {
        type: "gradient",
        gradient: {
            shadeIntensity: 1,
            opacityFrom: 0.8,
            opacityTo: 0.05,
            stops: [0, 100],
        },
    },
    stroke: {
        curve: "smooth",
        width: 2,
    },
    dataLabels: {
        enabled: false,
    },
    legend: {
        show: true,
        position: "bottom",
        offsetY: 6,
    },
    annotations: {
        yaxis: [
            {
                y: 50,
                borderColor: "#82A0D8",
                label: {
                    text: "Support",
                    style: {
                        color: "#fff",
                        background: "#5356FF",
                    },
                },
            },
        ],
        xaxis: [
            {
                borderColor: "#82A0D8",
                label: {
                    text: "Rally",
                    style: {
                        color: "#fff",
                        background: "#5356FF",
                    },
                },
            },
        ],
    },
    series: [
        {
            name: "Product A",
            data: dataA,
        },
        {
            name: "Product B",
            data: dataB,
        },
        {
            name: "Product C",
            data: dataC,
        },
    ],
};

export const IrregularTimeSeriesAreaChart = () => {
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
