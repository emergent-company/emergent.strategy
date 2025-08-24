import { FormEvent } from "react";
import { z } from "zod";

import { useFormValidation } from "./use-form-validation";

const schema = z.object({
    optionalNumber: z.preprocess((val) => (val === "" ? undefined : val), z.number().optional()),
    minimumNumber: z.number().min(18, "You must be at least 18"),
    maximumNumber: z.number().max(99, "You must be at maximum 99"),
});

export const NumberDemo = () => {
    const { formData, errors, handleChange, handleSubmit } = useFormValidation({
        schema,
        initialValues: {
            optionalNumber: "" as unknown as number,
            minimumNumber: 17,
            maximumNumber: 100,
        },
    });

    const submitForm = (e: FormEvent) => {
        handleSubmit(e, (data) => {
            console.info(data);
        });
    };

    return (
        <form onSubmit={submitForm} noValidate className="space-y-3">
            <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                    <label className="label text-sm font-medium" htmlFor="optionalNumber">
                        Optional Number
                    </label>
                    <p className="text-base-content/60 text-end text-xs">Can empty</p>
                </div>
                <input
                    name="optionalNumber"
                    id="optionalNumber"
                    type="number"
                    value={formData.optionalNumber}
                    onChange={handleChange}
                    data-error={errors.optionalNumber}
                    className="input data-error:input-error w-full"
                    placeholder="..."
                />
                <p
                    data-error={errors.optionalNumber}
                    className="text-error max-h-0 text-sm opacity-0 transition-all duration-300 data-error:max-h-8 data-error:opacity-100">
                    {errors.optionalNumber}
                </p>
            </div>
            <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                    <label className="label text-sm font-medium" htmlFor="minimumNumber">
                        Minimum Number
                    </label>
                    <p className="text-base-content/60 text-end text-xs">Minimum 18</p>
                </div>
                <input
                    name="minimumNumber"
                    id="minimumNumber"
                    type="number"
                    value={formData.minimumNumber}
                    onChange={handleChange}
                    data-error={errors.minimumNumber}
                    className="input data-error:input-error w-full"
                    placeholder="Required Text"
                />
                <p
                    data-error={errors.minimumNumber}
                    className="text-error max-h-0 text-sm opacity-0 transition-all duration-300 data-error:max-h-8 data-error:opacity-100">
                    {errors.minimumNumber}
                </p>
            </div>

            <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                    <label className="label text-sm font-medium" htmlFor="maximumNumber">
                        Maximum Number
                    </label>
                    <p className="text-base-content/60 text-end text-xs">Maximum 99</p>
                </div>
                <input
                    name="maximumNumber"
                    id="maximumNumber"
                    type="number"
                    value={formData.maximumNumber}
                    onChange={handleChange}
                    data-error={errors.maximumNumber}
                    className="input data-error:input-error w-full"
                    placeholder="Required Text"
                />
                <p
                    data-error={errors.maximumNumber}
                    className="text-error max-h-0 text-sm opacity-0 transition-all duration-300 data-error:max-h-8 data-error:opacity-100">
                    {errors.maximumNumber}
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
