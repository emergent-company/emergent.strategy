import { FormEvent } from "react";
import { z } from "zod";

import { useFormValidation } from "./use-form-validation";

const schema = z.object({
    requiredToggle: z.boolean().refine((val) => val, {
        message: "Accept terms to continue",
    }),
});

export const ToggleDemo = () => {
    const { formData, errors, handleChange, handleSubmit } = useFormValidation({
        schema,
        initialValues: {
            requiredToggle: false,
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
                <div className="flex items-center gap-2">
                    <input
                        name="requiredToggle"
                        type="checkbox"
                        id="requiredToggle"
                        data-error
                        checked={formData.requiredToggle}
                        onChange={handleChange}
                        className="toggle toggle-sm"
                    />
                    <label htmlFor="requiredToggle">I accept the terms and conditions</label>
                </div>
                <p
                    data-error={errors.requiredToggle}
                    className="text-error max-h-0 text-sm opacity-0 transition-all duration-300 data-error:max-h-8 data-error:opacity-100">
                    {errors.requiredToggle}
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
