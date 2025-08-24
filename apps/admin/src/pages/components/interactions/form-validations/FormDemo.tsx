import { FormEvent } from "react";
import { z } from "zod";

import { useFormValidation } from "./use-form-validation";

const schema = z.object({
    firstName: z.string("Please enter your first name").min(2, "First name must be at least 2 characters long"),
    lastName: z.string("Please enter your last name").min(2, "Last name must be at least 2 characters long"),
    username: z.string("Please enter your username").min(2, "Username must be at least 2 characters long"),
    email: z.email("Invalid email address"),
    phoneNumber: z.string("Phone number is invalid").regex(/^[0-9]{10}$/, "Phone number must be 10 digits long"),
    dob: z.iso.date("Invalid date of birth"),
});

export const FormDemo = () => {
    const { formData, errors, handleChange, handleSubmit, handleClear } = useFormValidation({
        schema,
        initialValues: {
            firstName: "",
            lastName: "",
            username: "",
            email: "",
            phoneNumber: "",
            dob: new Date().toLocaleString(),
        },
    });

    const submitForm = (e: FormEvent) => {
        handleSubmit(e, (data) => {
            console.info(data);
        });
    };

    return (
        <form onSubmit={submitForm}>
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 2xl:grid-cols-3">
                <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                        <label className="label text-sm font-medium" htmlFor="firstName">
                            First Name
                        </label>
                        <p className="text-base-content/60 text-end text-xs">* Required</p>
                    </div>
                    <label
                        htmlFor="firstName"
                        className="input data-error:input-error w-full"
                        data-error={errors.firstName}>
                        <span className="iconify lucide--user size-4.5"></span>
                        <input
                            name="firstName"
                            id="firstName"
                            type="text"
                            value={formData.firstName}
                            onChange={handleChange}
                            placeholder="Den"
                        />
                    </label>
                    <p
                        data-error={errors.firstName}
                        className="text-error max-h-0 text-sm opacity-0 transition-all duration-300 data-error:max-h-8 data-error:opacity-100">
                        {errors.firstName}
                    </p>
                </div>
                <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                        <label className="label text-sm font-medium" htmlFor="lastName">
                            Last Name
                        </label>
                        <p className="text-base-content/60 text-end text-xs">* Required</p>
                    </div>
                    <label
                        htmlFor="lastName"
                        className="input data-error:input-error w-full"
                        data-error={errors.lastName}>
                        <span className="iconify lucide--user size-4.5"></span>
                        <input
                            name="lastName"
                            id="lastName"
                            type="text"
                            value={formData.lastName}
                            onChange={handleChange}
                            placeholder="Navadiya"
                        />
                    </label>
                    <p
                        data-error={errors.lastName}
                        className="text-error max-h-0 text-sm opacity-0 transition-all duration-300 data-error:max-h-8 data-error:opacity-100">
                        {errors.lastName}
                    </p>
                </div>
                <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                        <label className="label text-sm font-medium" htmlFor="username">
                            Username
                        </label>
                        <p className="text-base-content/60 text-end text-xs">* Required</p>
                    </div>
                    <label
                        htmlFor="username"
                        className="input data-error:input-error w-full"
                        data-error={errors.username}>
                        <span className="iconify lucide--at-sign size-4.5"></span>
                        <input
                            name="username"
                            id="username"
                            type="text"
                            value={formData.username}
                            onChange={handleChange}
                            placeholder="withden"
                        />
                    </label>
                    <p
                        data-error={errors.username}
                        className="text-error max-h-0 text-sm opacity-0 transition-all duration-300 data-error:max-h-8 data-error:opacity-100">
                        {errors.username}
                    </p>
                </div>
                <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                        <label className="label text-sm font-medium" htmlFor="email">
                            Email
                        </label>
                        <p className="text-base-content/60 text-end text-xs">* Required</p>
                    </div>
                    <label htmlFor="email" className="input data-error:input-error w-full" data-error={errors.email}>
                        <span className="iconify lucide--mail size-4.5"></span>
                        <input
                            name="email"
                            id="email"
                            type="email"
                            value={formData.email}
                            onChange={handleChange}
                            placeholder="abc@xyz.com"
                        />
                    </label>
                    <p
                        data-error={errors.email}
                        className="text-error max-h-0 text-sm opacity-0 transition-all duration-300 data-error:max-h-8 data-error:opacity-100">
                        {errors.email}
                    </p>
                </div>
                <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                        <label className="label text-sm font-medium" htmlFor="phoneNumber">
                            Phone Number
                        </label>
                        <p className="text-base-content/60 text-end text-xs">* Required</p>
                    </div>
                    <label
                        htmlFor="phoneNumber"
                        className="input data-error:input-error w-full"
                        data-error={errors.phoneNumber}>
                        <span className="iconify lucide--phone size-4.5"></span>
                        <input
                            name="phoneNumber"
                            id="phoneNumber"
                            type="tel"
                            value={formData.phoneNumber}
                            onChange={handleChange}
                            placeholder="+84 78965 12335"
                        />
                    </label>
                    <p
                        data-error={errors.phoneNumber}
                        className="text-error max-h-0 text-sm opacity-0 transition-all duration-300 data-error:max-h-8 data-error:opacity-100">
                        {errors.phoneNumber}
                    </p>
                </div>
                <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                        <label className="label text-sm font-medium" htmlFor="dob">
                            Date of Birth
                        </label>
                        <p className="text-base-content/60 text-end text-xs">* Required</p>
                    </div>
                    <label htmlFor="dob" className="input data-error:input-error w-full" data-error={errors.dob}>
                        <span className="iconify lucide--calendar-1 size-4.5"></span>
                        <input
                            name="dob"
                            id="dob"
                            type="date"
                            value={formData.dob}
                            onChange={handleChange}
                            placeholder="+84 78965 12335"
                        />
                    </label>
                    <p
                        data-error={errors.dob}
                        className="text-error max-h-0 text-sm opacity-0 transition-all duration-300 data-error:max-h-8 data-error:opacity-100">
                        {errors.dob}
                    </p>
                </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-3">
                <button type="reset" className="btn btn-sm btn-outline border-base-300" onClick={handleClear}>
                    Clear
                </button>
                <button type="submit" className="btn btn-sm btn-primary">
                    Submit
                </button>
            </div>
        </form>
    );
};
