import React, { ComponentProps } from "react";

import { ComponentPageTitle } from "@/components/ComponentPageTitle";
import { MetaData } from "@/components/MetaData";

const ItemSkeleton = ({ className, ...props }: ComponentProps<"div">) => {
    return (
        <div
            {...props}
            className={
                "border-base-300/80 hover:bg-base-200/40 hover:border-base-300 bg-base-200/20 rounded-box flex cursor-pointer flex-col items-center justify-center border border-dashed text-center transition-all " +
                className
            }
        />
    );
};

const DashboardSkeletonPage = () => {
    return (
        <div>
            <MetaData title="Skeleton - Layouts" />
            <ComponentPageTitle
                label="Layouts"
                title="Dashboard Skeleton"
                description="Responsive dashboard blueprint, featuring adaptive grids for statistics, charts, and interactive content displays"
            />

            <p className="text-base-content/60 mt-6 font-medium lg:mt-12">Demos</p>

            <div className="mt-6 space-y-6 md:space-y-8 xl:space-y-12">
                <div className="card bg-base-100 card-border">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Basic</div>
                    <div className="p-5">
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                            <ItemSkeleton className="h-28">
                                <p className="text-base-content/80 font-medium">Stats</p>
                                <p className="text-base-content/50 text-sm">1 / 4</p>
                            </ItemSkeleton>
                            <ItemSkeleton className="h-28">
                                <p className="text-base-content/80 font-medium">Stats</p>
                                <p className="text-base-content/50 text-sm">1 / 4</p>
                            </ItemSkeleton>
                            <ItemSkeleton className="h-28">
                                <p className="text-base-content/80 font-medium">Stats</p>
                                <p className="text-base-content/50 text-sm">1 / 4</p>
                            </ItemSkeleton>
                            <ItemSkeleton className="h-28">
                                <p className="text-base-content/80 font-medium">Stats</p>
                                <p className="text-base-content/50 text-sm">1 / 4</p>
                            </ItemSkeleton>
                        </div>
                        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
                            <ItemSkeleton className="col-span-1 h-80 lg:col-span-7">
                                <p className="text-base-content/80 font-medium">Primary Chart</p>
                                <p className="text-base-content/50 text-sm">7 / 12</p>
                            </ItemSkeleton>
                            <ItemSkeleton className="col-span-1 h-80 lg:col-span-5">
                                <p className="text-base-content/80 font-medium">Secondary Chart</p>
                                <p className="text-base-content/50 text-sm">5 / 12</p>
                            </ItemSkeleton>
                        </div>
                        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
                            <ItemSkeleton className="h-60">
                                <p className="text-base-content/80 font-medium">Chat Area</p>
                                <p className="text-base-content/50 text-sm">1 / 3</p>
                            </ItemSkeleton>
                            <ItemSkeleton className="h-60">
                                <p className="text-base-content/80 font-medium">Listing</p>
                                <p className="text-base-content/50 text-sm">1 / 3</p>
                            </ItemSkeleton>
                            <ItemSkeleton className="h-60">
                                <p className="text-base-content/80 font-medium">Utility Section</p>
                                <p className="text-base-content/50 text-sm">1 / 3</p>
                            </ItemSkeleton>
                        </div>
                    </div>
                </div>
                <div className="card bg-base-100 card-border">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Multi-Panel</div>
                    <div className="p-5">
                        <div className="grid grid-cols-12 gap-5">
                            <div className="col-span-12 space-y-5 md:col-span-4 xl:col-span-3 2xl:col-span-2">
                                <ItemSkeleton className="h-22">
                                    <p className="text-base-content/80 font-medium">Stats</p>
                                    <p className="text-base-content/50 text-sm">2 / 12</p>
                                </ItemSkeleton>
                                <ItemSkeleton className="h-22">
                                    <p className="text-base-content/80 font-medium">Stats</p>
                                    <p className="text-base-content/50 text-sm">2 / 12</p>
                                </ItemSkeleton>
                                <ItemSkeleton className="h-22">
                                    <p className="text-base-content/80 font-medium">Stats</p>
                                    <p className="text-base-content/50 text-sm">2 / 12</p>
                                </ItemSkeleton>
                                <ItemSkeleton className="h-22">
                                    <p className="text-base-content/80 font-medium">Stats</p>
                                    <p className="text-base-content/50 text-sm">2 / 12</p>
                                </ItemSkeleton>
                            </div>
                            <ItemSkeleton className="col-span-12 h-103 md:col-span-8 xl:col-span-6 2xl:col-span-7">
                                <p className="text-base-content/80 font-medium">Primary Chart</p>
                                <p className="text-base-content/50 text-sm">7 / 12</p>
                            </ItemSkeleton>
                            <div className="col-span-12 xl:col-span-3">
                                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-1">
                                    <div className="col-span-1">
                                        <ItemSkeleton className="h-36 min-h-full">
                                            <p className="text-base-content/80 font-medium">Panel One</p>
                                            <p className="text-base-content/50 text-sm">3 / 12</p>
                                        </ItemSkeleton>
                                    </div>
                                    <div className="col-span-1">
                                        <ItemSkeleton className="h-62">
                                            <p className="text-base-content/80 font-medium">Panel Two</p>
                                            <p className="text-base-content/50 text-sm">3 / 12</p>
                                        </ItemSkeleton>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-4">
                            <ItemSkeleton className="h-60">
                                <p className="text-base-content/80 font-medium">Chat Area</p>
                                <p className="text-base-content/50 text-sm">1 / 4</p>
                            </ItemSkeleton>
                            <ItemSkeleton className="col-span-1 h-60 lg:col-span-2">
                                <p className="text-base-content/80 font-medium">Listing</p>
                                <p className="text-base-content/50 text-sm">2 / 4</p>
                            </ItemSkeleton>
                            <ItemSkeleton className="h-60">
                                <p className="text-base-content/80 font-medium">Utility Section</p>
                                <p className="text-base-content/50 text-sm">1 / 4</p>
                            </ItemSkeleton>
                        </div>
                    </div>
                </div>
                <div className="card bg-base-100 card-border">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Split View</div>
                    <div className="grid grid-cols-1 lg:grid-cols-4">
                        <div className="border-base-200 col-span-1 p-5 lg:col-span-3 lg:border-e">
                            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                                <ItemSkeleton className="h-28">
                                    <p className="text-base-content/80 font-medium">Stats</p>
                                    <p className="text-base-content/50 text-sm">1 / 3</p>
                                </ItemSkeleton>
                                <ItemSkeleton className="h-28">
                                    <p className="text-base-content/80 font-medium">Stats</p>
                                    <p className="text-base-content/50 text-sm">1 / 3</p>
                                </ItemSkeleton>
                                <ItemSkeleton className="h-28">
                                    <p className="text-base-content/80 font-medium">Stats</p>
                                    <p className="text-base-content/50 text-sm">1 / 3</p>
                                </ItemSkeleton>
                            </div>
                            <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
                                <ItemSkeleton className="h-112">
                                    <p className="text-base-content/80 font-medium">Listing</p>
                                    <p className="text-base-content/50 text-sm">1 / 2</p>
                                </ItemSkeleton>
                                <div className="space-y-5">
                                    <ItemSkeleton className="h-38">
                                        <p className="text-base-content/80 font-medium">Utility</p>
                                        <p className="text-base-content/50 text-sm">1 / 2</p>
                                    </ItemSkeleton>
                                    <ItemSkeleton className="h-69">
                                        <p className="text-base-content/80 font-medium">Chat Area</p>
                                        <p className="text-base-content/50 text-sm">1 / 2</p>
                                    </ItemSkeleton>
                                </div>
                            </div>
                        </div>
                        <div className="col-span-1 p-5 max-lg:pt-0">
                            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-1">
                                <ItemSkeleton className="h-80">
                                    <p className="text-base-content/80 font-medium">Panel One</p>
                                    <p className="text-base-content/50 text-sm">1 / 4</p>
                                </ItemSkeleton>
                                <ItemSkeleton className="h-60 min-h-full">
                                    <p className="text-base-content/80 font-medium">Panel Two</p>
                                    <p className="text-base-content/50 text-sm">1 / 4</p>
                                </ItemSkeleton>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DashboardSkeletonPage;
