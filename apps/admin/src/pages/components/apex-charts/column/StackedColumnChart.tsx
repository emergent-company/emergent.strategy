import type { ApexOptions } from "apexcharts";
import { Suspense, lazy, useEffect, useState } from "react";

import { LoadingEffect } from "@/components/LoadingEffect";

const ApexCharts = lazy(() => import("react-apexcharts"));

const chartOptions: ApexOptions = {
    xaxis: {
        categories: ["May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
        title: {
            text: "Monthly Cart Abandoned Count",
            style: { fontWeight: "500" },
        },
    },
    grid: {
        show: false,
    },
    stroke: {
        show: true,
        width: 1,
        colors: ["var(--color-base-100)"],
    },
    chart: {
        type: "bar",
        height: 380,
        toolbar: {
            show: true,
        },
        background: "transparent",
        stacked: true,
    },
    colors: ["#167bff", "#A25772", "#FB6D48", "#FDA403", "#8E7AB5"],
    fill: {
        type: "solid",
    },
    tooltip: {
        shared: true,
        intersect: false,
        inverseOrder: true,
    },
    plotOptions: {
        bar: {
            columnWidth: 40,
            borderRadius: 8,
            dataLabels: {
                total: {
                    enabled: true,
                    offsetY: -8,
                    style: {
                        color: "#FFA299",
                    },
                },
            },
        },
    },
    series: [
        {
            name: "Cart",
            data: [847, 723, 848, 573, 842, 973, 874, 942],
        },
        {
            name: "Checkout",
            data: [984, 697, 473, 784, 993, 824, 914, 973],
        },
        {
            name: "Shipping",
            data: [423, 673, 324, 473, 424, 347, 384, 442],
        },
        {
            name: "Payment",
            data: [384, 297, 362, 392, 427, 534, 377, 442],
        },
        {
            name: "Review",
            data: [642, 417, 304, 617, 439, 527, 689, 773],
        },
    ],
};

export const StackedColumnChart = () => {
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
