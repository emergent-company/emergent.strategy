import { useWizard } from "./use-wizard";

export const TabWizardDemo = () => {
    const { currentStep, goTo, totalSteps, goNext, canNext, canPrevious, goPrevious, isLastStep } = useWizard(4);

    return (
        <div>
            <div role="tablist" className="tabs tabs-box">
                <a
                    role="tab"
                    onClick={() => goTo(1)}
                    className={`tab grow gap-2 ${currentStep == 1 ? "tab-active" : ""}`}>
                    <span className="iconify lucide--user size-4"></span>
                    <span className="max-md:hidden">Personal Details</span>
                </a>
                <a
                    role="tab"
                    onClick={() => goTo(2)}
                    className={`tab grow gap-2 ${currentStep == 2 ? "tab-active" : ""}`}>
                    <span className="iconify lucide--settings-2 size-4"></span>
                    <span className="max-md:hidden">Account Settings</span>
                </a>
                <a
                    role="tab"
                    onClick={() => goTo(3)}
                    className={`tab grow gap-2 ${currentStep == 3 ? "tab-active" : ""}`}>
                    <span className="iconify lucide--shield-check size-4"></span>
                    <span className="max-md:hidden">Permissions</span>
                </a>
                <a
                    role="tab"
                    onClick={() => goTo(4)}
                    className={`tab grow gap-2 ${currentStep == 4 ? "tab-active" : ""}`}>
                    <span className="iconify lucide--check-circle-2 size-4"></span>
                    <span className="max-md:hidden">Review</span>
                </a>
            </div>
            <div className="bg-base-200/30 border-base-300 text-base-content/50 rounded-box mt-6 flex h-40 items-center justify-center p-5 font-medium">
                Step {currentStep} of {totalSteps}
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
