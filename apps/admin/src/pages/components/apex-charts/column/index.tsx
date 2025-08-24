import React from "react";
import { Link } from "react-router";

import { ComponentPageTitle } from "@/components/ComponentPageTitle";
import { MetaData } from "@/components/MetaData";

import { DumbbellColumnChart } from "./DumbbellColumnChart";
import { NegativeValuesColumnChart } from "./NegativeValuesColumnChart";
import { RangeColumnChart } from "./RangeColumnChart";
import { StackedColumnChart } from "./StackedColumnChart";

const ChartPage = () => {
    return (
        <>
            <MetaData title="Column Charts" />
            <ComponentPageTitle
                label="Apexcharts"
                title="Column Charts"
                description="A versatile set of column charts for comparing values, ranges, and trends visually"
            />
            <div className="bg-base-200/40 rounded-box mt-6 px-5 py-4 lg:mt-12">
                <p className="text-base-content/60 font-medium">Usage guidelines</p>
                <p className="mt-1">
                    <span className="me-1">- Plugin Documentation:</span>
                    <Link
                        to="https://apexcharts.com/javascript-chart-demos/column-charts/"
                        target="_blank"
                        className="text-primary">
                        Apexcharts
                    </Link>
                </p>
            </div>
            <p className="text-base-content/60 mt-6 font-medium">Demos</p>
            <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Stacked Column</div>
                    <div className="px-5 pt-5 pb-2">
                        <StackedColumnChart />
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Dumbbell Column</div>
                    <div className="px-5 pt-5 pb-2">
                        <DumbbellColumnChart />
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Range Column</div>
                    <div className="px-5 pt-5 pb-2">
                        <RangeColumnChart />
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Negative Values Column</div>
                    <div className="px-5 pt-5 pb-2">
                        <NegativeValuesColumnChart />
                    </div>
                </div>
            </div>
            `
        </>
    );
};

export default ChartPage;
