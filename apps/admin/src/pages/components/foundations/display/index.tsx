import React from "react";

import { ComponentPageTitle } from "@/components/ComponentPageTitle";
import { MetaData } from "@/components/MetaData";

const DisplayPage = () => {
    return (
        <div>
            <MetaData title="Display - Foundations" />

            <ComponentPageTitle
                label="Foundations"
                title="Display"
                description="Showcase visual styles and utilities to control layout, visibility, and element appearance"
            />

            <p className="text-base-content/60 mt-6 font-medium lg:mt-12">Demos</p>

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Flex: Row</div>
                    <div className="p-6">
                        <div className="flex gap-6">
                            <div className="bg-base-200 rounded-box text-base-content/60 flex size-12 items-center justify-center md:size-16">
                                1
                            </div>
                            <div className="bg-base-200 rounded-box text-base-content/60 flex size-12 items-center justify-center md:size-16">
                                2
                            </div>
                            <div className="bg-base-200 rounded-box text-base-content/60 flex size-12 items-center justify-center md:size-16">
                                3
                            </div>
                            <div className="bg-base-200 rounded-box text-base-content/60 flex size-12 items-center justify-center md:size-16">
                                4
                            </div>
                        </div>
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Flex: Reverse Row </div>
                    <div className="p-6">
                        <div className="inline-flex flex-row-reverse gap-6">
                            <div className="bg-base-200 rounded-box text-base-content/60 flex size-12 items-center justify-center md:size-16">
                                1
                            </div>
                            <div className="bg-base-200 rounded-box text-base-content/60 flex size-12 items-center justify-center md:size-16">
                                2
                            </div>
                            <div className="bg-base-200 rounded-box text-base-content/60 flex size-12 items-center justify-center md:size-16">
                                3
                            </div>
                            <div className="bg-base-200 rounded-box text-base-content/60 flex size-12 items-center justify-center md:size-16">
                                4
                            </div>
                        </div>
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Flex: Column</div>
                    <div className="p-6">
                        <div className="flex flex-col gap-6">
                            <div className="bg-base-200 rounded-box text-base-content/60 flex size-12 items-center justify-center md:size-16">
                                1
                            </div>
                            <div className="bg-base-200 rounded-box text-base-content/60 flex size-12 items-center justify-center md:size-16">
                                2
                            </div>
                            <div className="bg-base-200 rounded-box text-base-content/60 flex size-12 items-center justify-center md:size-16">
                                3
                            </div>
                        </div>
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Flex: Reverse Row </div>
                    <div className="p-6">
                        <div className="inline-flex flex-col-reverse gap-6">
                            <div className="bg-base-200 rounded-box text-base-content/60 flex size-12 items-center justify-center md:size-16">
                                1
                            </div>
                            <div className="bg-base-200 rounded-box text-base-content/60 flex size-12 items-center justify-center md:size-16">
                                2
                            </div>
                            <div className="bg-base-200 rounded-box text-base-content/60 flex size-12 items-center justify-center md:size-16">
                                3
                            </div>
                        </div>
                    </div>
                </div>
                <div className="card card-border bg-base-100 col-span-full">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Grid of 4</div>
                    <div className="p-4 sm:p-6">
                        <div className="grid grid-cols-4 gap-4 sm:gap-6">
                            <div className="bg-base-200 rounded-box text-base-content/60 flex h-20 items-center justify-center text-sm md:h-28">
                                1/4
                            </div>
                            <div className="bg-base-200 rounded-box text-base-content/60 flex h-20 items-center justify-center text-sm md:h-28">
                                1/4
                            </div>
                            <div className="bg-base-200 rounded-box text-base-content/60 flex h-20 items-center justify-center text-sm md:h-28">
                                1/4
                            </div>
                            <div className="bg-base-200 rounded-box text-base-content/60 flex h-20 items-center justify-center text-sm sm:h-28">
                                1/4
                            </div>
                        </div>
                    </div>
                </div>
                <div className="card card-border bg-base-100 col-span-full">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Grid of 6</div>
                    <div className="p-4 sm:p-6">
                        <div className="grid grid-cols-6 gap-4 sm:gap-6">
                            <div className="bg-base-200 rounded-box text-base-content/60 col-span-3 flex h-20 items-center justify-center text-sm sm:h-28">
                                3/6
                            </div>
                            <div className="bg-base-200 rounded-box text-base-content/60 col-span-2 flex h-20 items-center justify-center text-sm sm:h-28">
                                2/6
                            </div>
                            <div className="bg-base-200 rounded-box text-base-content/60 col-span-1 flex h-20 items-center justify-center text-sm sm:h-28">
                                1/6
                            </div>
                        </div>
                    </div>
                </div>
                <div className="card card-border bg-base-100 col-span-full">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Grid: Column</div>
                    <div className="p-6">
                        <div className="grid grid-flow-col grid-rows-4 gap-6">
                            {Array.from({ length: 9 }).map((_, i) => (
                                <div
                                    className="bg-base-200 rounded-box text-base-content/60 col-span-2 flex h-12 items-center justify-center"
                                    key={i}>
                                    {i + 1}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DisplayPage;
