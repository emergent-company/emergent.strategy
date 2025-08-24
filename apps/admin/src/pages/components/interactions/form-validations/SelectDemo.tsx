import { FormEvent } from "react";
import { z } from "zod";

import { useFormValidation } from "./use-form-validation";

const schema = z.object({
    requiredSelect: z.string().min(1, "Select a country"),
});

export const SelectDemo = () => {
    const { formData, errors, handleChange, handleSubmit } = useFormValidation({
        schema,
        initialValues: {
            requiredSelect: "",
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
                    <label className="label text-sm font-medium" htmlFor="requiredSelect">
                        Select
                    </label>
                    <p className="text-base-content/60 text-end text-xs">* Required</p>
                </div>
                <select
                    name="requiredSelect"
                    id="requiredSelect"
                    value={formData.requiredSelect}
                    onChange={handleChange}
                    data-error={errors.requiredSelect}
                    className="select data-error:select-error w-full">
                    <option value="">Select Country</option>
                    <option value="india">India</option>
                    <option value="usa">USA</option>
                    <option value="germany">Germany</option>
                </select>
                <p
                    data-error={errors.requiredSelect}
                    className="text-error max-h-0 text-sm opacity-0 transition-all duration-300 data-error:max-h-8 data-error:opacity-100">
                    {errors.requiredSelect}
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
