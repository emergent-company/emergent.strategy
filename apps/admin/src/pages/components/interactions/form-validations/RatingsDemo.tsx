import { FormEvent } from "react";
import { z } from "zod";

import { useFormValidation } from "./use-form-validation";

const schema = z.object({
    requiredRating: z.preprocess(
        (e) => (e === undefined ? undefined : parseInt(e as string)),
        z.number("Please select a rating").min(1, "Please select a rating"),
    ),
});

export const RatingsDemo = () => {
    const { formData, errors, updateFormData, handleSubmit } = useFormValidation({
        schema,
        initialValues: {
            requiredRating: 0,
        },
    });

    const submitForm = (e: FormEvent) => {
        handleSubmit(e, (data) => {
            console.info(data);
        });
    };

    return (
        <form onSubmit={submitForm} className="space-y-3">
            <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                    <label className="label text-sm font-medium" htmlFor="requiredRating">
                        Ratings ({formData.requiredRating})
                    </label>
                    <p className="text-base-content/60 text-end text-xs">Select a rating</p>
                </div>
                <div className="rating">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <input
                            key={i}
                            type="radio"
                            name="requiredRating"
                            defaultChecked={i < (formData.requiredRating ?? 0) ? true : undefined}
                            onChange={() => updateFormData("requiredRating", i + 1)}
                            className="mask mask-star-2 bg-orange-400"
                            aria-label="Star"
                        />
                    ))}
                </div>

                <p
                    data-error={errors.requiredRating}
                    className="text-error max-h-0 text-sm opacity-0 transition-all duration-300 data-error:max-h-8 data-error:opacity-100">
                    {errors.requiredRating}
                </p>
            </div>
            <div className="text-end">
                <button type="submit" className="btn btn-sm">
                    Submit
                </button>
            </div>
        </form>
    );
};
