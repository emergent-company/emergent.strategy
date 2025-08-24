import { FormEvent } from "react";
import { z } from "zod";

import { useFormValidation } from "./use-form-validation";

const schema = z.object({
    betweenNumber: z.number().min(20, "You must be at least 20").max(80, "You must be at maximum 80"),
});

export const RangeDemo = () => {
    const { formData, errors, handleChange, handleSubmit } = useFormValidation({
        schema,
        initialValues: {
            betweenNumber: 15,
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
                    <label className="label text-sm font-medium" htmlFor="betweenNumber">
                        Age ({formData.betweenNumber})
                    </label>
                    <p className="text-base-content/60 text-end text-xs">Between 5 to 95</p>
                </div>
                <input
                    type="range"
                    min="0"
                    max="100"
                    name="betweenNumber"
                    id="betweenNumber"
                    value={formData.betweenNumber}
                    onChange={handleChange}
                    data-error={errors.betweenNumber}
                    className="range data-error:range-error range-primary range-xs w-full transition-all duration-300"
                />

                <p
                    data-error={errors.betweenNumber}
                    className="text-error max-h-0 text-sm opacity-0 transition-all duration-300 data-error:max-h-8 data-error:opacity-100">
                    {errors.betweenNumber}
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
