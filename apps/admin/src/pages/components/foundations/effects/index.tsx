import React from "react";

import { ComponentPageTitle } from "@/components/ComponentPageTitle";
import { MetaData } from "@/components/MetaData";

const imageFilters = [
    { name: "Normal", class: "" },
    { name: "Grayscale", class: "grayscale" },
    { name: "Invert", class: "invert" },
    { name: "Sepia", class: "sepia" },
    { name: "Blur", class: "blur-sm" },
    { name: "Brightness", class: "brightness-125" },
    { name: "Contrast", class: "contrast-200" },
    { name: "Saturate", class: "saturate-200" },
    { name: "Hue Rotate", class: "hue-rotate-60" },
];

const blendModes = [
    "No Blend",
    "bg-blend-multiply",
    "bg-blend-screen",
    "bg-blend-overlay",
    "bg-blend-darken",
    "bg-blend-lighten",
    "bg-blend-color-dodge",
    "bg-blend-color-burn",
    "bg-blend-hard-light",
    "bg-blend-soft-light",
    "bg-blend-difference",
    "bg-blend-exclusion",
    "bg-blend-hue",
    "bg-blend-saturation",
    "bg-blend-color",
    "bg-blend-luminosity",
];

const backdropFilters = [
    { name: "opacity-30", class: "" },
    { name: "backdrop-blur-md", class: "backdrop-blur-md" },
    { name: "backdrop-brightness-125", class: "backdrop-brightness-125" },
    { name: "backdrop-contrast-200", class: "backdrop-contrast-200" },
    { name: "backdrop-grayscale", class: "backdrop-grayscale" },
    { name: "backdrop-hue-rotate-90", class: "backdrop-hue-rotate-90" },
    { name: "backdrop-invert", class: "backdrop-invert" },
    { name: "backdrop-saturate-200", class: "backdrop-saturate-200" },
    { name: "backdrop-sepia", class: "backdrop-sepia" },
];

const EffectsPage = () => {
    return (
        <div>
            <MetaData title="Effects - Foundations" />

            <ComponentPageTitle
                label="Foundations"
                title="Effects"
                description="Explore visual effects like filters and backdrops to enhance depth and style effortlessly"
            />

            <p className="text-base-content/60 mt-6 font-medium lg:mt-12">Demos</p>

            <div className="mt-6 space-y-6">
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Filter</div>
                    <div className="grid grid-cols-2 gap-4 p-4 sm:gap-8 sm:p-6 lg:grid-cols-4">
                        {imageFilters.map((filter, index) => (
                            <div key={index} className="flex flex-col items-center justify-center gap-2">
                                <img
                                    src="/images/apps/ecommerce/products/9.jpg"
                                    alt="Filter"
                                    className={`rounded-box size-28 md:size-36 ${filter.class}`}
                                />
                                <p className="text-base-content/60 text-sm">{filter.name}</p>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Background Blend</div>
                    <div className="grid grid-cols-2 gap-4 p-4 sm:gap-6 sm:p-6 lg:grid-cols-4">
                        {blendModes.map((mode, index) => (
                            <div key={index} className="flex flex-col items-center justify-center gap-2">
                                <div
                                    className={`bg-primary rounded-box size-28 bg-[url(/images/apps/ecommerce/products/9.jpg)] bg-cover bg-center md:size-36 ${
                                        mode === "No Blend" ? "" : mode
                                    }`}></div>
                                <p className="text-base-content/60 sm:t ext-sm text-xs">{mode}</p>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Overlay Filter</div>
                    <div className="grid grid-cols-2 gap-4 p-4 sm:gap-6 sm:p-6 lg:grid-cols-4">
                        {backdropFilters.map((filter, index) => (
                            <div key={index} className="flex flex-col items-center justify-center gap-2">
                                <div className="relative">
                                    <img
                                        src="/images/apps/ecommerce/products/9.jpg"
                                        alt="backdrop-filter"
                                        className="rounded-box size-32 md:size-48"
                                    />
                                    <div
                                        className={`rounded-box absolute start-1/2 top-1/2 size-20 -translate-1/2 bg-white/30 md:size-28 ${filter.class}`}></div>
                                </div>
                                <p className="text-base-content/60 text-xs sm:text-sm">{filter.name}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EffectsPage;
