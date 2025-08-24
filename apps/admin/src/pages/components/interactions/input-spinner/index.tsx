import React from "react";

import { ComponentPageTitle } from "@/components/ComponentPageTitle";
import { MetaData } from "@/components/MetaData";

import { ChipDemo } from "./ChipDemo";
import { DisabledDemo } from "./DisabledDemo";
import { FractionalDemo } from "./FractionalDemo";
import { InActionDemo } from "./InActionDemo";
import { InlineDemo } from "./InlineDemo";
import { JoinDemo } from "./JoinDemo";
import { MinMaxDemo } from "./MinMaxDemo";
import { MultiStepsDemo } from "./MultiStepsDemo";
import { ReadonlyDemo } from "./ReadonlyDemo";
import { SimpleDemo } from "./SimpleDemo";
import { VerticalDemo } from "./VerticalDemo";

const InputSpinnerPage = () => {
    return (
        <div>
            <MetaData title="Input Spinner - Interactions" />
            <ComponentPageTitle
                label="Interactions"
                title="Input Spinner"
                description="Versatile number input spinner with steps, limits, styles, and vertical or inline controls"
            />

            <p className="text-base-content/60 mt-6 font-medium lg:mt-12">In Action</p>
            <div className="mt-4 lg:mt-6">
                <InActionDemo />
            </div>
            <p className="text-base-content/60 mt-8 font-medium">Demos</p>
            <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 px-5 py-3">
                        <p className="font-medium">Simple</p>
                        <p className="text-base-content/80 text-sm">Basic number spinner with plus and minus</p>
                    </div>
                    <div className="p-6">
                        <SimpleDemo />
                    </div>
                </div>

                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 px-5 py-3">
                        <p className="font-medium">Disabled</p>
                        <p className="text-base-content/80 text-sm">Spinner input with controls turned off</p>
                    </div>
                    <div className="p-6">
                        <DisabledDemo />
                    </div>
                </div>

                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 px-5 py-3">
                        <p className="font-medium">Readonly</p>
                        <p className="text-base-content/80 text-sm">Shows value without allowing changes</p>
                    </div>
                    <div className="p-6">
                        <ReadonlyDemo />
                    </div>
                </div>

                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 px-5 py-3">
                        <p className="font-medium">Inline</p>
                        <p className="text-base-content/80 text-sm">Spinner fits neatly within text or inputs</p>
                    </div>
                    <div className="p-6">
                        <InlineDemo />
                    </div>
                </div>

                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 px-5 py-3">
                        <p className="font-medium">Multi Steps</p>
                        <p className="text-base-content/80 text-sm">Increments or decrements in custom steps</p>
                    </div>
                    <div className="p-6">
                        <MultiStepsDemo />
                    </div>
                </div>

                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 px-5 py-3">
                        <p className="font-medium">Join</p>
                        <p className="text-base-content/80 text-sm">Spinner combined with other form elements</p>
                    </div>
                    <div className="p-6">
                        <JoinDemo />
                    </div>
                </div>

                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 px-5 py-3">
                        <p className="font-medium">Min Max</p>
                        <p className="text-base-content/80 text-sm">Restricts value within min and max range</p>
                    </div>
                    <div className="p-6">
                        <MinMaxDemo />
                    </div>
                </div>

                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 px-5 py-3">
                        <p className="font-medium">Fractional</p>
                        <p className="text-base-content/80 text-sm">Supports decimal values like 0.1 or 0.25</p>
                    </div>
                    <div className="p-6">
                        <FractionalDemo />
                    </div>
                </div>

                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 px-5 py-3">
                        <p className="font-medium">Chip</p>
                        <p className="text-base-content/80 text-sm">Spinner styled like a compact chip</p>
                    </div>
                    <div className="p-6">
                        <ChipDemo />
                    </div>
                </div>

                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 px-5 py-3">
                        <p className="font-medium">Vertical</p>
                        <p className="text-base-content/80 text-sm">Up and down buttons stacked vertically</p>
                    </div>
                    <div className="p-6">
                        <VerticalDemo />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InputSpinnerPage;
