import React from "react";
import { Link } from "react-router";

import { ComponentPageTitle } from "@/components/ComponentPageTitle";
import { MetaData } from "@/components/MetaData";

import { AnnotationLineChart } from "./AnnotationLineChart";
import { LabelLineChart } from "./LabelLineChart";
import { StepLineChart } from "./StepLineChart";
import { SyncingLineChart } from "./SyncingLineChart";

const ChartPage = () => {
    return (
        <>
            <MetaData title="Line Charts" />
            <ComponentPageTitle
                label="Apexcharts"
                title="Line Charts"
                description="A set of interactive line charts for visualizing trends, comparisons, and annotations"
            />
            <div className="bg-base-200/40 rounded-box mt-6 px-5 py-4 lg:mt-12">
                <p className="text-base-content/60 font-medium">Usage guidelines</p>
                <p className="mt-1">
                    <span className="me-1">- Plugin Documentation:</span>
                    <Link
                        to="https://apexcharts.com/javascript-chart-demos/line-charts/"
                        target="_blank"
                        className="text-primary">
                        Apexcharts
                    </Link>
                </p>
            </div>
            <p className="text-base-content/60 mt-6 font-medium">Demos</p>

            <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Label Line</div>
                    <div className="px-5 pt-5 pb-2">
                        <LabelLineChart />
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Step Line</div>
                    <div className="px-5 pt-5 pb-2">
                        <StepLineChart />
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Syncing Line</div>
                    <div className="px-5 pt-5 pb-2">
                        <SyncingLineChart />
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Annotation Line</div>
                    <div className="px-5 pt-5 pb-2">
                        <AnnotationLineChart />
                    </div>
                </div>
            </div>
        </>
    );
};

export default ChartPage;
