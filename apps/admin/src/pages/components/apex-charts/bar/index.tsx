import React from "react";
import { Link } from "react-router";

import { ComponentPageTitle } from "@/components/ComponentPageTitle";
import { MetaData } from "@/components/MetaData";

import { GroupedBarChart } from "./GroupedBarChart";
import { MarkerWithBarChart } from "./MarkerWithBarChart";
import { NegativeValueBarChart } from "./NegativeValueBarChart";
import { StackedBarChart } from "./StackedBarChart";

const ChartPage = () => {
    return (
        <>
            <MetaData title="Bar Charts" />
            <ComponentPageTitle
                label="Apexcharts"
                title="Bar Charts"
                description="A collection of bar charts for comparing data, groups, and positive or negative values"
            />
            <div className="bg-base-200/40 rounded-box mt-6 px-5 py-4 lg:mt-12">
                <p className="text-base-content/60 font-medium">Usage guidelines</p>
                <p className="mt-1">
                    <span className="me-1">- Plugin Documentation:</span>
                    <Link
                        to="https://apexcharts.com/javascript-chart-demos/bar-charts/"
                        target="_blank"
                        className="text-primary">
                        Apexcharts
                    </Link>
                </p>
            </div>
            <p className="text-base-content/60 mt-6 font-medium">Demos</p>

            <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Bar With Markers</div>
                    <div className="px-3 pt-5 pb-2">
                        <MarkerWithBarChart />
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Grouped Bar</div>
                    <div className="px-3 pt-5 pb-2">
                        <GroupedBarChart />
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Stacked Bar</div>
                    <div className="px-3 pt-5 pb-2">
                        <StackedBarChart />
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Negative Value</div>
                    <div className="px-3 pt-5 pb-2">
                        <NegativeValueBarChart />
                    </div>
                </div>
            </div>
        </>
    );
};

export default ChartPage;
