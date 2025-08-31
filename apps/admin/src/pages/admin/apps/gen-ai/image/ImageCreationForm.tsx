import { useState } from "react";
import { Icon } from "@/components/ui/Icon";

import { imageTypes } from "./helpers";

export const ImageCreationForm = () => {
    const [selectedType, setSelectedType] = useState(imageTypes[0]);

    return (
        <div className="space-y-6">
            <div className="bg-base-100 card-border card">
                <div className="gap-0 card-body">
                    <div className="card-title">Configure</div>
                    <div className="gap-4 mt-2 fieldset">
                        <div className="space-y-2">
                            <label className="fieldset-label" htmlFor="describe">
                                Describe your image
                            </label>
                            <textarea
                                className="pb-0 w-full h-16 leading-5 textarea"
                                id="describe"
                                placeholder="E.g., A sunny beach with clear blue water"
                                aria-label="Textarea"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="fieldset-label" htmlFor="engine">
                                Engine
                            </label>
                            <select className="w-full select" defaultValue="" id="engine">
                                <option>Stable Diffusion</option>
                                <option>DALL·E</option>
                                <option>MidJourney</option>
                                <option>DeepAI</option>
                                <option>RunwayML</option>
                            </select>
                        </div>
                        <div className="gap-4 grid grid-cols-2">
                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="image-size">
                                    Image Size
                                </label>
                                <select className="w-full select" defaultValue="" id="image-size">
                                    <option>512x512</option>
                                    <option>1024x1024</option>
                                    <option>1920x1080</option>
                                    <option>2048x2048</option>
                                    <option>Portrait</option>
                                    <option>Landscape</option>
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="image-number">
                                    Images
                                </label>
                                <select className="w-full select" defaultValue="2" id="image-number">
                                    <option value="1">1</option>
                                    <option value="2">2</option>
                                    <option value="3">3</option>
                                    <option value="4">4</option>
                                    <option value="5">5</option>
                                    <option value="6">6</option>
                                </select>
                            </div>
                        </div>

                        <label className="fieldset-label">Type</label>
                        <div className="gap-2 grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-3">
                            {imageTypes.map((imageType, index) => (
                                <div
                                    key={index}
                                    onClick={() => {
                                        setSelectedType(imageType);
                                    }}
                                    className={`hover:bg-base-200 rounded-box cursor-pointer border border-transparent p-1 transition-all ${selectedType === imageType ? "!border-primary/20 !bg-primary/10 text-primary font-medium" : ""}`}>
                                    <img src={imageType.image} alt={imageType.type} className="rounded-box" />
                                    <p className="mt-1 text-sm text-center">{imageType.type}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 mt-5">
                        <button className="btn btn-ghost btn-sm" disabled>
                            Stop
                        </button>
                        <button className="btn btn-sm btn-primary">
                            <Icon icon="lucide--wand-2" className="size-3.5" aria-hidden />
                            Generate
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
