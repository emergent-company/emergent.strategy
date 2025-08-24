import { FormEvent } from "react";
import { z } from "zod";

import { useFormValidation } from "./use-form-validation";

const schema = z.object({
    requiredEmail: z.email("Invalid email address"),
    optionalEmail: z.preprocess((val) => (val === "" ? undefined : val), z.email("Invalid email address").optional()),
});

export const EmailDemo = () => {
    const { formData, errors, handleChange, handleSubmit } = useFormValidation({
        schema,
        initialValues: {
            optionalEmail: "",
            requiredEmail: "",
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
                    <label className="label text-sm font-medium" htmlFor="optionalEmail">
                        Optional Email
                    </label>
                    <p className="text-base-content/60 text-end text-xs">Can empty</p>
                </div>
                <input
                    name="optionalEmail"
                    id="optionalEmail"
                    type="email"
                    value={formData.optionalEmail}
                    onChange={handleChange}
                    data-error={errors.optionalEmail}
                    className="input data-error:input-error w-full"
                    placeholder="abc@mail.com"
                />
                <p
                    data-error={errors.optionalEmail}
                    className="text-error max-h-0 text-sm opacity-0 transition-all duration-300 data-error:max-h-8 data-error:opacity-100">
                    {errors.optionalEmail}
                </p>
            </div>
            <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                    <label className="label text-sm font-medium" htmlFor="requiredEmail">
                        Email Address
                    </label>
                    <p className="text-base-content/60 text-end text-xs">* Required</p>
                </div>
                <input
                    name="requiredEmail"
                    id="requiredEmail"
                    type="email"
                    value={formData.requiredEmail}
                    onChange={handleChange}
                    data-error={errors.requiredEmail}
                    className="input data-error:input-error w-full"
                    placeholder="abc@mail.com"
                />
                <p
                    data-error={errors.requiredEmail}
                    className="text-error max-h-0 text-sm opacity-0 transition-all duration-300 data-error:max-h-8 data-error:opacity-100">
                    {errors.requiredEmail}
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
