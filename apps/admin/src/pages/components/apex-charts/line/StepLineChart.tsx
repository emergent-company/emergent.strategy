import type { ApexOptions } from "apexcharts";
import { Suspense, lazy, useEffect, useState } from "react";

import { LoadingEffect } from "@/components/LoadingEffect";

const ApexCharts = lazy(() => import("react-apexcharts"));

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
        categories: ["Jul-2", "Aug-1", "Aug-2", "Sep-1", "Sep-2", "Oct-1", "Oct-2", "Nov-1", "Nov-2", "Dec-1"],
        title: {
            text: "Customer Support Ticket Volume",
            style: { fontWeight: "500" },
        },
    },
    tooltip: {
        y: {
            formatter: (val) => val + " Tickets",
        },
    },
    stroke: {
        curve: "stepline",
        width: 2,
    },
    colors: ["#167bff"],
    series: [
        {
            name: "Volume",
            data: [144, 154, 121, 112, 143, 233, 223, 166, 166, 158],
        },
    ],
};

export const StepLineChart = () => {
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
