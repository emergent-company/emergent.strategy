import React from "react";

import { useWizard } from "./use-wizard";

const steps = ["Personal Details", "Account Settings", "Permissions", "Review"];

export const ProgressWizardDemo = () => {
    const { currentStep, goTo, goNext, canNext, canPrevious, goPrevious, isLastStep, totalSteps } = useWizard(4);

    return (
        <div>
            <div>
                <div className="grid grid-cols-4 items-center gap-3">
                    {steps.map((step, index) => (
                        <div
                            key={index}
                            className="text-base-content/80 hover:text-base-content flex cursor-pointer items-center justify-center gap-2"
                            onClick={() => goTo(index + 1)}>
                            <div
                                className={`flex size-6 items-center justify-center rounded-full font-medium ${index + 1 >= currentStep ? "bg-base-200" : "bg-primary text-primary-content"}`}>
                                <span
                                    className={`iconify lucide--check ${index + 1 >= currentStep ? "hidden" : ""}`}></span>
                                <span className={`${index + 1 >= currentStep ? "" : "hidden"}`}>{index + 1}</span>
                            </div>
                            <span className="font-medium max-lg:hidden">{step}</span>
                        </div>
                    ))}
                </div>
                <div className="bg-base-200 relative mt-2 h-1.5 overflow-hidden rounded-full">
                    <div
                        className="bg-primary absolute h-full w-full origin-left scale-x-0 rounded-full transition-all duration-500"
                        style={{ scale: `${((currentStep - 1) * 100) / totalSteps}% 100%` }}></div>
                    <div
                        className="bg-primary/30 h-full w-full origin-left scale-x-0 rounded-full transition-all duration-500"
                        style={{ scale: `${(currentStep * 100) / totalSteps}% 100%` }}></div>
                </div>
            </div>
            <div className="bg-base-200/30 border-base-300 text-base-content/50 rounded-box mt-6 flex h-40 items-center justify-center p-5 font-medium">
                Step {currentStep} of {steps.length}
            </div>
            <div className="mt-4 flex justify-between">
                {canPrevious && (
                    <button className="btn gap-2" onClick={goPrevious}>
                        <span className="iconify lucide--chevron-left size-4"></span>
                        <span>Prev</span>
                    </button>
                )}
                {canNext && (
                    <button className="btn ms-auto gap-2" onClick={goNext}>
                        <span>Next</span>
                        <span className="iconify lucide--chevron-right size-4"></span>
                    </button>
                )}
                {isLastStep && (
                    <button className="btn btn-primary ms-auto gap-2">
                        <span className="iconify lucide--flag size-4"></span>
                        <span>Finish</span>
                    </button>
                )}
            </div>
        </div>
    );
};
