import React from "react";
import { Link } from "react-router";

import { ComponentPageTitle } from "@/components/ComponentPageTitle";
import { MetaData } from "@/components/MetaData";

import { GradientDonutChart } from "./GradientDonutChart";
import { MonochromePieChart } from "./MonochromePieChart";
import { PatternDonutChart } from "./PatternDonutChart";
import { SimplePieChart } from "./SimplePieChart";

const ChartPage = () => {
    return (
        <>
            <MetaData title="Pie Charts" />
            <ComponentPageTitle
                label="Apexcharts"
                title="Pie Charts"
                description="A variety of pie and donut charts for visualizing proportions and data distribution"
            />
            <div className="bg-base-200/40 rounded-box mt-6 px-5 py-4 lg:mt-12">
                <p className="text-base-content/60 font-medium">Usage guidelines</p>
                <p className="mt-1">
                    <span className="me-1">- Plugin Documentation:</span>
                    <Link
                        to="https://apexcharts.com/javascript-chart-demos/pie-charts/"
                        target="_blank"
                        className="text-primary">
                        Apexcharts
                    </Link>
                </p>
            </div>
            <p className="text-base-content/60 mt-6 font-medium">Demos</p>

            <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Simple Pie</div>
                    <div className="px-5 pt-5 pb-2">
                        <SimplePieChart />
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Monochrome Pie</div>
                    <div className="px-5 pt-5 pb-2">
                        <MonochromePieChart />
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Gradient Donut</div>
                    <div className="px-5 pt-5 pb-2">
                        <GradientDonutChart />
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Pattern Donut</div>
                    <div className="px-5 pt-5 pb-2">
                        <PatternDonutChart />
                    </div>
                </div>
            </div>
        </>
    );
};

export default ChartPage;
