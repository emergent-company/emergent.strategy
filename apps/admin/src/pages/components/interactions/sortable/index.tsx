import React from "react";
import { Link } from "react-router";

import { ComponentPageTitle } from "@/components/ComponentPageTitle";
import { MetaData } from "@/components/MetaData";

import { AnimatedDemo } from "./AnimatedDemo";
import { FilterDemo } from "./FilterDemo";
import { GridDemo } from "./GridDemo";
import { GridHandleDemo } from "./GridHandleDemo";
import { HandleDemo } from "./HandleDemo";
import { InActionDemo } from "./InActionDemo";
import { MultiDragDemo } from "./MultiDragDemo";
import { SharedDemo } from "./SharedDemo";
import { SimpleDemo } from "./SimpleDemo";
import { SwapDemo } from "./SwapDemo";

const SortablePage = () => {
    return (
        <div>
            <MetaData title="Sortable - Interactions" />
            <ComponentPageTitle
                label="Interactions"
                title="Sortable"
                description="Drag and drop sorting with handles, filters, grids, animations, and multi-drag support"
            />
            <div className="bg-base-200/40 rounded-box mt-6 px-5 py-4 lg:mt-12">
                <p className="text-base-content/60 font-medium">Usage guidelines</p>
                <p className="mt-1">
                    <span className="me-1">- Plugin Documentation:</span>
                    <Link to="https://sortablejs.github.io/Sortable/" target="_blank" className="text-primary">
                        SortableJS
                    </Link>
                </p>
            </div>
            <p className="text-base-content/60 mt-6 font-medium">In Action</p>
            <div className="mt-4 lg:mt-6">
                <InActionDemo />
            </div>
            <p className="text-base-content/60 mt-8 font-medium">Demos</p>
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <div className="bg-base-100 card card-border h-fit">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Simple</div>
                    <div className="p-5">
                        <SimpleDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border h-fit">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Handle</div>
                    <div className="p-5">
                        <HandleDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border col-span-1 h-fit lg:col-span-2">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Shared</div>
                    <div className="p-5">
                        <SharedDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border h-fit">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Filter</div>
                    <div className="p-5">
                        <FilterDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border h-fit">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Animated (Bouncy)</div>
                    <div className="p-5">
                        <AnimatedDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border h-fit">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Plugin: Multi Drag</div>
                    <div className="p-5">
                        <MultiDragDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border h-fit">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Plugin: Swap</div>
                    <div className="p-5">
                        <SwapDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border col-span-1 h-fit lg:col-span-2">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Grid</div>
                    <div className="p-5">
                        <GridDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border col-span-1 h-fit lg:col-span-2">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Grid Handle</div>
                    <div className="p-5">
                        <GridHandleDemo />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SortablePage;
