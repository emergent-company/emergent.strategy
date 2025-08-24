import React from "react";
import { Link } from "react-router";

import { ComponentPageTitle } from "@/components/ComponentPageTitle";
import { MetaData } from "@/components/MetaData";

import { MandarinLocaleDemo } from "./ChineseLocaleDemo";
import { ConfirmPluginDemo } from "./ConfirmPluginDemo";
import { ControlsDemo } from "./ControlsDemo";
import { DateDemo } from "./DateDemo";
import { DateTimeDemo } from "./DateTimeDemo";
import { DisabledDatesDemo } from "./DisabledDatesDemo";
import { DisabledDemo } from "./DisabledDemo";
import { EnabledDatesDemo } from "./EnabledDatesDemo";
import { HindiLocaleDemo } from "./HindiLocaleDemo";
import { HumanFriendlyDemo } from "./HumanFriendlyDemo";
import { InlineDemo } from "./InlineDemo";
import { MinMaxDemo } from "./MinMaxDemo";
import { MonthPluginDemo } from "./MonthPluginDemo";
import { MultipleDemo } from "./MultipleDemo";
import { RangeDemo } from "./RangeDemo";
import { RangePluginDemo } from "./RangePluginDemo";
import { Time24Demo } from "./Time24Demo";
import { TimeDemo } from "./TimeDemo";
import { WeekNumberDemo } from "./WeekNumberDemo";
import { WeekPluginDemo } from "./WeekPluginDemo";

const FlatpickrPage = () => {
    return (
        <div>
            <MetaData title="Flatpickr - Interactions" />
            <ComponentPageTitle
                label="Interactions"
                title="Flatpickr"
                description="Feature-rich calendar with date, time, range, plugins, and full localization support."
            />
            <div className="bg-base-200/40 rounded-box mt-6 px-5 py-4 lg:mt-12">
                <p className="text-base-content/60 font-medium">Usage guidelines</p>
                <p className="mt-1">
                    <span className="me-1">- Plugin Documentation:</span>
                    <Link to="https://flatpickr.js.org/" target="_blank" className="text-primary">
                        Flatpickr
                    </Link>
                </p>
            </div>
            <p className="text-base-content/60 mt-6 font-medium">Demos</p>
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Date</div>
                    <div className="p-5">
                        <DateDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Disabled</div>
                    <div className="p-5">
                        <DisabledDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Time (AM/PM)</div>
                    <div className="p-5">
                        <TimeDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Time (24 Hours)</div>
                    <div className="p-5">
                        <Time24Demo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Date Time</div>
                    <div className="p-5">
                        <DateTimeDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Human Friendly</div>
                    <div className="p-5">
                        <HumanFriendlyDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Controls</div>
                    <div className="p-5">
                        <ControlsDemo />
                    </div>
                </div>
            </div>
            <p className="text-base-content/70 mt-6 font-medium">Inline</p>
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Inline</div>
                    <div className="p-5">
                        <InlineDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Min max</div>
                    <div className="p-5">
                        <MinMaxDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Enabled Dates</div>
                    <div className="p-5">
                        <EnabledDatesDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Disabled Dates</div>
                    <div className="p-5">
                        <DisabledDatesDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Multiple</div>
                    <div className="p-5">
                        <MultipleDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Range</div>
                    <div className="p-5">
                        <RangeDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border max-sm:hidden">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Week Number</div>
                    <div className="p-5">
                        <WeekNumberDemo />
                    </div>
                </div>
            </div>
            <p className="text-base-content/70 mt-6 font-medium">Plugins</p>
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Range</div>
                    <div className="p-5">
                        <RangePluginDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Confirm</div>
                    <div className="p-5">
                        <ConfirmPluginDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Select Week</div>
                    <div className="p-5">
                        <WeekPluginDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Month</div>
                    <div className="p-5">
                        <MonthPluginDemo />
                    </div>
                </div>
            </div>
            <p className="text-base-content/70 mt-6 font-medium">Localization (Demo)</p>
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Hindi</div>
                    <div className="p-5">
                        <HindiLocaleDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Mandarin</div>
                    <div className="p-5">
                        <MandarinLocaleDemo />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FlatpickrPage;
