import React from "react";

import { ComponentPageTitle } from "@/components/ComponentPageTitle";
import { MetaData } from "@/components/MetaData";

const textClasses = [
    "text-xs",
    "text-sm",
    "text-base", // Changed 'md' to 'base' for standard Tailwind or keep 'md' if it's a custom utility.
    "text-lg",
    "text-xl",
    "text-2xl",
    "text-3xl",
    "text-4xl",
    "text-5xl",
    "text-6xl",
];

const fontWeights = [
    "font-thin",
    "font-extralight",
    "font-light",
    "font-normal",
    "font-medium",
    "font-semibold",
    "font-bold",
    "font-extrabold",
    "font-black",
];

const TextPage = () => {
    return (
        <div>
            <MetaData title="Text - Foundations" />

            <ComponentPageTitle
                label="Foundations"
                title="Text"
                description="A collection of text styles, gradients, and weights for polished typography design"
            />

            <p className="text-base-content/60 mt-6 font-medium lg:mt-12">Demos</p>

            <div className="mt-6 space-y-6">
                <div className="card card-border">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Sizes</div>
                    <div className="flex flex-col gap-3 p-6">
                        {textClasses.map((className, index) => (
                            <p key={index} className={className}>
                                The quick brown fox jumps...
                            </p>
                        ))}
                    </div>
                </div>
                <div className="card card-border">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Weight</div>
                    <div className="flex flex-col gap-3 p-6">
                        {fontWeights.map((weightClass, index) => (
                            <p key={index} className={weightClass}>
                                The quick brown fox jumps...
                            </p>
                        ))}
                    </div>
                </div>
                <div className="card card-border">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Gradient Text</div>
                    <div className="w-full p-6 text-center">
                        <p className="from-primary to-secondary inline-block bg-linear-to-r bg-clip-text text-2xl font-black text-transparent sm:text-3xl md:text-4xl">
                            Why everytime fox jumps...
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TextPage;
