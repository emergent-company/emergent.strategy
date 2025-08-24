import { useCallback, useState } from "react";

export const useWizard = (totalSteps: number, props?: { initialStep: number }) => {
    const { initialStep = 1 } = props ?? {};
    const [step, setStep] = useState(initialStep);

    const canPrevious = step > 1;
    const canNext = step < totalSteps;
    const isLastStep = step === totalSteps;

    const goNext = useCallback(() => {
        setStep((s) => (s < totalSteps ? s + 1 : s));
    }, [totalSteps]);

    const goPrevious = useCallback(() => {
        setStep((s) => (s > 1 ? s - 1 : s));
    }, []);

    const goTo = useCallback(
        (index: number) => {
            setStep(() => {
                if (index < 1) return 1;
                if (index > totalSteps) return totalSteps;
                return index;
            });
        },
        [totalSteps],
    );

    return {
        currentStep: step,
        totalSteps,
        canNext,
        canPrevious,
        goNext,
        goPrevious,
        isLastStep,
        goTo,
    };
};
