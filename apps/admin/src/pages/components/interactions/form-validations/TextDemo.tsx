import { FormEvent } from "react";
import { z } from "zod";

import { useFormValidation } from "./use-form-validation";

const schema = z.object({
    optionalText: z.string().optional(),
    minimumText: z.string().min(3, "Text must be at least 3 characters"),
    maximumText: z.string().max(5, "Text must be at max 5 characters"),
});

export const TextDemo = () => {
    const { formData, errors, handleChange, handleSubmit } = useFormValidation({
        schema,
        initialValues: {
            optionalText: "",
            minimumText: "12",
            maximumText: "123456",
        },
    });

    const submitForm = (e: FormEvent) => {
        handleSubmit(e, (data) => {
            console.info(data);
        });
    };

    return (
        <form onSubmit={submitForm} noValidate className="space-y-3">
            <div className="flex flex-col items-stretch gap-1.5">
                <div className="flex items-center justify-between gap-2">
                    <label className="label text-sm font-medium" htmlFor="optionalText">
                        Optional Text
                    </label>
                    <p className="text-base-content/60 text-end text-xs">Can empty</p>
                </div>
                <input
                    name="optionalText"
                    id="optionalText"
                    type="text"
                    value={formData.optionalText}
                    onChange={handleChange}
                    data-error={errors.optionalText}
                    className="input data-error:input-error w-full"
                    placeholder="..."
                />
                <p
                    data-error={errors.optionalText}
                    className="text-error max-h-0 text-sm opacity-0 transition-all duration-300 data-error:max-h-8 data-error:opacity-100">
                    {errors.optionalText}
                </p>
            </div>
            <div className="flex flex-col items-stretch gap-1.5">
                <div className="flex items-center justify-between gap-2">
                    <label className="label text-sm font-medium" htmlFor="minimumText">
                        Minimum Text
                    </label>
                    <p className="text-base-content/60 text-end text-xs">Min 3 chars</p>
                </div>
                <input
                    name="minimumText"
                    id="minimumText"
                    type="text"
                    value={formData.minimumText}
                    onChange={handleChange}
                    data-error={errors.minimumText}
                    className="input data-error:input-error w-full"
                    placeholder="A1B2C3"
                />
                <p
                    data-error={errors.minimumText}
                    className="text-error max-h-0 text-sm opacity-0 transition-all duration-300 data-error:max-h-8 data-error:opacity-100">
                    {errors.minimumText}
                </p>
            </div>
            <div className="flex flex-col items-stretch gap-1.5">
                <div className="flex items-center justify-between gap-2">
                    <label className="label text-sm font-medium" htmlFor="maximumText">
                        Maximum Text
                    </label>
                    <p className="text-base-content/60 text-end text-xs">Max 5 chars</p>
                </div>
                <input
                    name="maximumText"
                    id="maximumText"
                    type="text"
                    value={formData.maximumText}
                    onChange={handleChange}
                    data-error={errors.maximumText}
                    className="input data-error:input-error w-full"
                    placeholder="A1B2"
                />
                <p
                    data-error={errors.maximumText}
                    className="text-error max-h-0 text-sm opacity-0 transition-all duration-300 data-error:max-h-8 data-error:opacity-100">
                    {errors.maximumText}
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
