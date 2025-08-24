import { FormEvent } from "react";
import { z } from "zod";

import { useFormValidation } from "./use-form-validation";

const schema = z.object({
    requiredRadio: z.enum(["male", "female", "other"], { message: "Select gender" }),
});

export const RadioDemo = () => {
    const { formData, errors, handleChange, handleSubmit } = useFormValidation({
        schema,
        initialValues: {
            requiredRadio: "" as unknown as "male" | "female" | "other",
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
                    <label className="label text-sm font-medium" htmlFor="requiredRadio">
                        Gender
                    </label>
                    <p className="text-base-content/60 text-end text-xs">* Required</p>
                </div>
                <div className="flex gap-2">
                    {["male", "female", "other"].map((g) => (
                        <label key={g} className="label cursor-pointer gap-2">
                            <input
                                type="radio"
                                name="requiredRadio"
                                value={g}
                                checked={formData.requiredRadio === g}
                                onChange={handleChange}
                                className="radio radio-sm"
                            />
                            <span className="capitalize">{g}</span>
                        </label>
                    ))}
                </div>
                <p
                    data-error={errors.requiredRadio}
                    className="text-error max-h-0 text-sm opacity-0 transition-all duration-300 data-error:max-h-8 data-error:opacity-100">
                    {errors.requiredRadio}
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
