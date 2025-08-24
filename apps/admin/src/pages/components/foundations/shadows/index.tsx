import React from "react";

import { ComponentPageTitle } from "@/components/ComponentPageTitle";
import { MetaData } from "@/components/MetaData";

const shadowVariants = [
    { name: "shadow-none", class: "shadow-none" },
    { name: "shadow-2xs", class: "shadow-2xs" },
    { name: "shadow-xs", class: "shadow-xs" },
    { name: "shadow-sm", class: "shadow-sm" },
    { name: "shadow-md", class: "shadow-md" },
    { name: "shadow-lg", class: "shadow-lg" },
    { name: "shadow-xl", class: "shadow-xl" },
    { name: "shadow-2xl", class: "shadow-2xl" },
    { name: "shadow-primary", class: "shadow-lg shadow-primary/20" },
    { name: "shadow-secondary", class: "shadow-lg shadow-secondary/20" },
    { name: "shadow-success", class: "shadow-lg shadow-success/20" },
    { name: "shadow-error", class: "shadow-lg shadow-error/20" },
];

const insetShadowVariants = [
    { name: "inset-shadow-none", class: "inset-shadow-none" },
    { name: "inset-shadow-2xs", class: "inset-shadow-2xs" },
    { name: "inset-shadow-xs", class: "inset-shadow-xs" },
    { name: "inset-shadow-sm", class: "inset-shadow-sm" },
    { name: "inset-shadow-primary", class: "inset-shadow-sm inset-shadow-primary/15" },
    { name: "inset-shadow-secondary", class: "inset-shadow-sm inset-shadow-secondary/15" },
    { name: "inset-shadow-success", class: "inset-shadow-sm inset-shadow-success/15" },
    { name: "inset-shadow-error", class: "inset-shadow-sm inset-shadow-error/15" },
];

const textShadowVariants = [
    { name: "text-shadow-none", class: "text-shadow-none" },
    { name: "text-shadow-2xs", class: "text-shadow-2xs" },
    { name: "text-shadow-xs", class: "text-shadow-xs" },
    { name: "text-shadow-sm", class: "text-shadow-sm" },
    { name: "text-shadow-md", class: "text-shadow-md" },
    { name: "text-shadow-lg", class: "text-shadow-lg" },
    { name: "text-shadow-primary", class: "text-shadow-lg text-shadow-primary/20 text-primary" },
    { name: "text-shadow-secondary", class: "text-shadow-lg text-shadow-secondary/20 text-secondary" },
    { name: "text-shadow-success", class: "text-shadow-lg text-shadow-success/20 text-success" },
    { name: "text-shadow-error", class: "text-shadow-lg text-shadow-error/20 text-error" },
];

const ShadowsPage = () => {
    return (
        <div>
            <MetaData title="Shadows - Foundations" />

            <ComponentPageTitle
                label="Foundations"
                title="Shadows"
                description="A showcase of subtle and bold shadows to elevate your UI components"
            />

            <p className="text-base-content/60 mt-6 font-medium lg:mt-12">Demos</p>

            <div className="mt-6 space-y-6">
                <div className="card card-border bg-base-200/20">
                    <div className="bg-base-200/40 rounded-t-box px-5 py-3 font-medium">Box Shadow</div>
                    <div className="grid grid-cols-2 gap-4 p-4 sm:gap-8 sm:p-6 lg:grid-cols-4">
                        {shadowVariants.map((shadow, index) => (
                            <div key={index} className="flex items-center justify-center gap-2">
                                <div
                                    className={`bg-base-100 rounded-box text-base-content/60 flex size-36 items-center justify-center text-sm md:size-48 ${shadow.class}`}>
                                    {shadow.name}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="card card-border">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Inset Shadow</div>
                    <div className="grid grid-cols-2 gap-4 p-4 sm:gap-8 sm:p-6 lg:grid-cols-4">
                        {insetShadowVariants.map((shadow, index) => (
                            <div key={index} className="flex items-center justify-center gap-2">
                                <div
                                    className={`bg-base-100 border-base-200 rounded-box text-base-content/60 flex size-36 items-center justify-center border p-3 text-center text-xs sm:text-sm md:size-48 ${shadow.class}`}>
                                    {shadow.name}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="card card-border">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Text Shadow</div>
                    <div className="flex flex-col gap-3 p-4 sm:p-6">
                        {textShadowVariants.map((shadow, index) => (
                            <p key={index} className={`font-semibold capitalize sm:text-lg md:text-xl ${shadow.class}`}>
                                {shadow.name}
                            </p>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ShadowsPage;
