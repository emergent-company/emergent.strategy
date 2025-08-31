import { useState } from "react";
import { Icon } from "@/components/ui/Icon";

import { generatedImages1, generatedImages2, imageTypes } from "./helpers";

export const GeneratedImages = () => {
    const [selectedType, setSelectedType] = useState(imageTypes[0]);

    return (
        <div className="bg-base-100 card-border card">
            <div className="flex justify-between items-center p-5 pb-0">
                <div>
                    <div className="flex items-center gap-2">
                        <div className="inline-flex items-center bg-primary p-1.5 rounded-box text-primary-content">
                            <Icon icon="lucide--book-image" className="size-4" aria-hidden />
                        </div>
                        <p className="font-medium">Images</p>
                    </div>
                    <p className="text-sm text-base-content/80">
                        <span className="text-error">Note:</span> cloud sync is disabled.
                        <span className="ms-1 link link-primary link-hover">Start sync?</span>
                    </p>
                </div>
                <div className="text-center">
                    <p className="text-sm text-base-content/80">Available Tokens</p>
                    <p className="font-medium text-lg">
                        961<span className="ms-1 text-sm text-base-content/60">/1000</span>
                    </p>
                </div>
                <div className="hidden 2xl:inline-flex items-center gap-3 bg-base-200 py-2 ps-3 pe-2 rounded-box">
                    <p className="text-sm">Trial period has ended</p>
                    <button className="btn btn-sm btn-warning">Upgrade</button>
                </div>
            </div>
            <hr className="mt-5 border-base-300 border-dashed w-full" />
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
                <div className="flex justify-between items-center gap-2 mt-5">
                    <p className="font-medium">Watercolor Painting</p>
                    <div className="hidden md:flex items-center gap-5">
                        <div className="inline-flex items-center gap-2 text-base-content/60 hover:text-base-content transition-all cursor-pointer">
                            <Icon icon="lucide--image-down" className="size-3.5" aria-hidden />
                            <p className="text-sm">Download All</p>
                        </div>
                        <div className="inline-flex items-center gap-2 text-base-content/60 hover:text-base-content transition-all cursor-pointer">
                            <Icon icon="lucide--book-image" className="size-3.5" aria-hidden />
                            <p className="text-sm">8</p>
                        </div>

                        <div className="inline-flex items-center gap-2 text-base-content/60 hover:text-base-content transition-all cursor-pointer">
                            <Icon icon="lucide--cpu" className="size-3.5" aria-hidden />
                            <p className="text-sm">Stable diffusion</p>
                        </div>
                    </div>
                </div>
                <div className="gap-5 grid grid-cols-3 md:grid-cols-5 lg:grid-cols-3 xl:grid-cols-5 mt-2">
                    {generatedImages1.map((generated, index) => (
                        <div key={index} className="group relative">
                            <img src={generated} alt={generated} className="rounded-box" />
                            <div className="bottom-0 group-hover:bottom-4 absolute flex justify-around items-center gap-2 bg-black/60 opacity-0 group-hover:opacity-100 backdrop-blur-sm px-2 py-1.5 rounded-box text-white scale-75 group-hover:scale-100 transition-all -translate-x-1/2 start-1/2">
                                <div className="hover:bg-white/20 p-1 rounded-box cursor-pointer" aria-label="Download image">
                                    <Icon icon="lucide--arrow-down-to-line" className="block size-3.5" aria-hidden />
                                </div>
                                <div className="hover:bg-white/20 p-1 rounded-box cursor-pointer" aria-label="Change palette">
                                    <Icon icon="lucide--palette" className="block size-3.5" aria-hidden />
                                </div>
                                <div className="hover:bg-white/20 p-1 rounded-box cursor-pointer" aria-label="Add to collection">
                                    <Icon icon="lucide--image-plus" className="block size-3.5" aria-hidden />
                                </div>
                                <div className="hover:bg-white/20 p-1 rounded-box cursor-pointer" aria-label="Maximize preview">
                                    <Icon icon="lucide--maximize" className="block size-3.5" aria-hidden />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="flex justify-between items-center gap-2 mt-5">
                    <p className="font-medium">3D Elements</p>
                    <div className="hidden md:flex items-center gap-5">
                        <div className="inline-flex items-center gap-2 text-base-content/60 hover:text-base-content transition-all cursor-pointer">
                            <Icon icon="lucide--image-down" className="size-3.5" aria-hidden />
                            <p className="text-sm">Download All</p>
                        </div>
                        <div className="inline-flex items-center gap-2 text-base-content/60 hover:text-base-content transition-all cursor-pointer">
                            <Icon icon="lucide--book-image" className="size-3.5" aria-hidden />
                            <p className="text-sm">10+</p>
                        </div>
                        <div className="inline-flex items-center gap-2 text-base-content/60 hover:text-base-content transition-all cursor-pointer">
                            <Icon icon="lucide--cpu" className="size-3.5" aria-hidden />
                            <p className="text-sm">Deep AI</p>
                        </div>
                    </div>
                </div>
                <div className="gap-5 grid grid-cols-3 md:grid-cols-5 mt-2">
                    {generatedImages2.map((generated, index) => (
                        <div key={index} className="group relative">
                            <img src={generated} alt={generated} className="rounded-box" />
                            <div className="bottom-0 group-hover:bottom-4 absolute flex justify-around items-center gap-2 bg-black/60 opacity-0 group-hover:opacity-100 backdrop-blur-sm px-2 py-1.5 rounded-box text-white scale-75 group-hover:scale-100 transition-all -translate-x-1/2 start-1/2">
                                <div className="hover:bg-white/20 p-1 rounded-box cursor-pointer" aria-label="Download image">
                                    <Icon icon="lucide--arrow-down-to-line" className="block size-3.5" aria-hidden />
                                </div>
                                <div className="hover:bg-white/20 p-1 rounded-box cursor-pointer" aria-label="Change palette">
                                    <Icon icon="lucide--palette" className="block size-3.5" aria-hidden />
                                </div>
                                <div className="hover:bg-white/20 p-1 rounded-box cursor-pointer" aria-label="Add to collection">
                                    <Icon icon="lucide--image-plus" className="block size-3.5" aria-hidden />
                                </div>
                                <div className="hover:bg-white/20 p-1 rounded-box cursor-pointer" aria-label="Maximize preview">
                                    <Icon icon="lucide--maximize" className="block size-3.5" aria-hidden />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="mt-5 text-center">
                    <button className="btn btn-sm">
                        <Icon icon="lucide--arrow-down" className="size-3.5" aria-hidden />
                        Load more
                    </button>
                </div>
            </div>
        </div>
    );
};
