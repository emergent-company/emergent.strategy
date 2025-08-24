import { useState } from "react";

import { generatedImages1, generatedImages2, imageTypes } from "./helpers";

export const GeneratedImages = () => {
    const [selectedType, setSelectedType] = useState(imageTypes[0]);

    return (
        <div className="card card-border bg-base-100">
            <div className="flex items-center justify-between p-5 pb-0">
                <div>
                    <div className="flex items-center gap-2">
                        <div className="bg-primary text-primary-content rounded-box inline-flex items-center p-1.5">
                            <span className="iconify lucide--book-image size-4" />
                        </div>
                        <p className="font-medium">Images</p>
                    </div>
                    <p className="text-base-content/80 text-sm">
                        <span className="text-error">Note:</span> cloud sync is disabled.
                        <span className="link link-primary link-hover ms-1">Start sync?</span>
                    </p>
                </div>
                <div className="text-center">
                    <p className="text-base-content/80 text-sm">Available Tokens</p>
                    <p className="text-lg font-medium">
                        961<span className="text-base-content/60 ms-1 text-sm">/1000</span>
                    </p>
                </div>
                <div className="bg-base-200 rounded-box hidden items-center gap-3 py-2 ps-3 pe-2 2xl:inline-flex">
                    <p className="text-sm">Trial period has ended</p>
                    <button className="btn btn-sm btn-warning">Upgrade</button>
                </div>
            </div>
            <hr className="border-base-300 mt-5 w-full border-dashed" />
            <div className="card-body">
                <div className="flex flex-wrap gap-2.5">
                    {imageTypes.map((imageType, index) => (
                        <div
                            className={`rounded-box cursor-pointer border px-2.5 py-0.5 transition-all ${imageType == selectedType ? "border-primary/20 bg-primary/10 text-primary" : "bg-base-200 hover:bg-base-300 border-transparent"}`}
                            key={index}
                            onClick={() => setSelectedType(imageType)}>
                            {imageType.type}
                        </div>
                    ))}
                </div>
                <div className="mt-5 flex items-center justify-between gap-2">
                    <p className="font-medium">Watercolor Painting</p>
                    <div className="hidden items-center gap-5 md:flex">
                        <div className="text-base-content/60 hover:text-base-content inline-flex cursor-pointer items-center gap-2 transition-all">
                            <span className="iconify lucide--image-down size-3.5" />
                            <p className="text-sm">Download All</p>
                        </div>
                        <div className="text-base-content/60 hover:text-base-content inline-flex cursor-pointer items-center gap-2 transition-all">
                            <span className="iconify lucide--book-image size-3.5" />
                            <p className="text-sm">8</p>
                        </div>

                        <div className="text-base-content/60 hover:text-base-content inline-flex cursor-pointer items-center gap-2 transition-all">
                            <span className="iconify lucide--cpu size-3.5" />
                            <p className="text-sm">Stable diffusion</p>
                        </div>
                    </div>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-5 md:grid-cols-5 lg:grid-cols-3 xl:grid-cols-5">
                    {generatedImages1.map((generated, index) => (
                        <div key={index} className="group relative">
                            <img src={generated} alt={generated} className="rounded-box" />
                            <div className="rounded-box absolute start-1/2 bottom-0 flex -translate-x-1/2 scale-75 items-center justify-around gap-2 bg-black/60 px-2 py-1.5 text-white opacity-0 backdrop-blur-sm transition-all group-hover:bottom-4 group-hover:scale-100 group-hover:opacity-100">
                                <div className="rounded-box cursor-pointer p-1 hover:bg-white/20">
                                    <span className="iconify lucide--arrow-down-to-line block size-3.5" />
                                </div>
                                <div className="rounded-box cursor-pointer p-1 hover:bg-white/20">
                                    <span className="iconify lucide--palette block size-3.5" />
                                </div>
                                <div className="rounded-box cursor-pointer p-1 hover:bg-white/20">
                                    <span className="iconify lucide--image-plus block size-3.5" />
                                </div>
                                <div className="rounded-box cursor-pointer p-1 hover:bg-white/20">
                                    <span className="iconify lucide--maximize block size-3.5" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="mt-5 flex items-center justify-between gap-2">
                    <p className="font-medium">3D Elements</p>
                    <div className="hidden items-center gap-5 md:flex">
                        <div className="text-base-content/60 hover:text-base-content inline-flex cursor-pointer items-center gap-2 transition-all">
                            <span className="iconify lucide--image-down size-3.5" />
                            <p className="text-sm">Download All</p>
                        </div>
                        <div className="text-base-content/60 hover:text-base-content inline-flex cursor-pointer items-center gap-2 transition-all">
                            <span className="iconify lucide--book-image size-3.5" />
                            <p className="text-sm">10+</p>
                        </div>

                        <div className="text-base-content/60 hover:text-base-content inline-flex cursor-pointer items-center gap-2 transition-all">
                            <span className="iconify lucide--cpu size-3.5" />
                            <p className="text-sm">Deep AI</p>
                        </div>
                    </div>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-5 md:grid-cols-5">
                    {generatedImages2.map((generated, index) => (
                        <div key={index} className="group relative">
                            <img src={generated} alt={generated} className="rounded-box" />
                            <div className="rounded-box absolute start-1/2 bottom-0 flex -translate-x-1/2 scale-75 items-center justify-around gap-2 bg-black/60 px-2 py-1.5 text-white opacity-0 backdrop-blur-sm transition-all group-hover:bottom-4 group-hover:scale-100 group-hover:opacity-100">
                                <div className="rounded-box cursor-pointer p-1 hover:bg-white/20">
                                    <span className="iconify lucide--arrow-down-to-line block size-3.5" />
                                </div>
                                <div className="rounded-box cursor-pointer p-1 hover:bg-white/20">
                                    <span className="iconify lucide--palette block size-3.5" />
                                </div>
                                <div className="rounded-box cursor-pointer p-1 hover:bg-white/20">
                                    <span className="iconify lucide--image-plus block size-3.5" />
                                </div>
                                <div className="rounded-box cursor-pointer p-1 hover:bg-white/20">
                                    <span className="iconify lucide--maximize block size-3.5" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="mt-5 text-center">
                    <button className="btn btn-sm">
                        <span className="iconify lucide--arrow-down size-3.5" />
                        Load more
                    </button>
                </div>
            </div>
        </div>
    );
};
