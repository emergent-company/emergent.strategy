import type { ApexOptions } from "apexcharts";
import { Suspense, lazy, useEffect, useState } from "react";

import { LoadingEffect } from "@/components/LoadingEffect";

const ApexCharts = lazy(() => import("react-apexcharts"));

const chartOptions: ApexOptions = {
    chart: {
        height: 305,
        type: "line",
        background: "transparent",
        toolbar: { show: false },
    },
    stroke: {
        curve: "smooth",
        width: 2, // Keeping lines thin and sharp
    },
    dataLabels: { enabled: false },
    colors: ["#ff8b4b", "#4caf50", "#6c74f8"], // Three distinct colors
    legend: {
        show: true,
        horizontalAlign: "center",
        offsetY: 6,
    },
    series: [
        {
            name: "NeuraText",
            data: [320, 330, 345, 310, 295, 340, 360, 345, 355, 370, 385, 400, 380, 360, 370, 390, 410, 420, 415],
        },
        {
            name: "VisioGen",
            data: [300, 315, 295, 320, 335, 320, 290, 270, 300, 330, 340, 335, 290, 280, 310, 325, 310, 295, 285],
        },
        {
            name: "EchoWave",
            data: [280, 295, 270, 260, 275, 300, 275, 280, 280, 300, 315, 305, 285, 290, 295, 310, 320, 310, 295],
        },
    ],
    xaxis: {
        categories: [
            "Feb 19",
            "Feb 20",
            "Feb 21",
            "Feb 22",
            "Feb 23",
            "Feb 24",
            "Feb 25",
            "Feb 26",
            "Feb 27",
            "Feb 28",
            "Feb 29",
            "Mar 1",
            "Mar 2",
            "Mar 3",
            "Mar 4",
            "Mar 5",
            "Mar 6",
            "Mar 7",
            "Mar 8",
        ],
        axisBorder: { show: false },
        axisTicks: { show: false },
    },
    yaxis: {
        labels: { show: true },
        axisBorder: { show: false },
        axisTicks: { show: false },
    },
    tooltip: {
        enabled: true,
        shared: true,
        intersect: false,
    },
    grid: { show: true, borderColor: "rgba(150,150,150,0.2)" },
    responsive: [
        {
            breakpoint: 450,
            options: {
                stroke: { width: 1.5 },
                xaxis: { tickAmount: 5 },
            },
        },
    ],
};

export const ModalUsagesChart = () => {
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
