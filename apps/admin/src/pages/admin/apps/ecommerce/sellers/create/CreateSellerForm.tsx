import React, { useState } from "react";
import { Link } from "react-router";

import { FileUploader } from "@/components/forms/FileUploader";
import { Icon } from "@/components/ui/Icon";

export const CreateSellerForm = () => {
    const [showPassword, setShowPassword] = useState(false);

    return (
        <div>
            <div className="gap-6 grid grid-cols-1 md:grid-cols-2">
                <div className="bg-base-100 shadow card">
                    <div className="card-body">
                        <div className="card-title">Basic Information</div>
                        <div className="gap-4 grid grid-cols-1 lg:grid-cols-2 mt-2 fieldset">
                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="name">
                                    Name
                                </label>
                                <input type="text" className="w-full input" placeholder="Name" id="name" />
                            </div>
                            <div className="space-y-2">
                                <label className="fieldset-label">Email</label>
                                <input type="email" className="w-full input" placeholder="Email" id="email" />
                            </div>
                            <div className="space-y-2">
                                <label className="fieldset-label">Mobile</label>
                                <input type="tel" className="w-full input" placeholder="(098) 765 4321" />
                            </div>
                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="DOB">
                                    DOB
                                </label>
                                <input type="date" className="w-full input" aria-label="DOB" id="DOB" />
                            </div>
                            <div className="flex items-center gap-3">
                                <input className="toggle toggle-sm" type="checkbox" id="verified" />
                                <label className="label" htmlFor="verified">
                                    Verified
                                </label>
                            </div>
                            <div className="flex items-center gap-3">
                                <input
                                    className="radio radio-sm"
                                    type="radio"
                                    value="male"
                                    defaultChecked
                                    name="apps-seller-gender"
                                    id="apps-seller-gender-male"
                                />
                                <label className="fieldset-label" htmlFor="apps-seller-gender-male">
                                    Male
                                </label>
                                <input
                                    className="radio radio-sm"
                                    value="female"
                                    type="radio"
                                    defaultChecked
                                    name="apps-seller-gender"
                                    id="apps-seller-gender-female"
                                />
                                <label className="fieldset-label" htmlFor="apps-seller-gender-female">
                                    Female
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="bg-base-100 shadow card">
                    <div className="card-body">
                        <div className="card-title">Address</div>
                        <div className="gap-4 grid grid-cols-1 lg:grid-cols-2 mt-2 fieldset">
                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="street-address">
                                    Street Address
                                </label>
                                <input
                                    type="text"
                                    className="w-full input"
                                    id="street-address"
                                    placeholder="Street Address"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="city">
                                    City
                                </label>
                                <input type="text" className="w-full input" id="city" placeholder="City" />
                            </div>
                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="state">
                                    State
                                </label>
                                <input type="text" className="w-full input" id="state" placeholder="State" />
                            </div>
                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="postal-code">
                                    Postal Code
                                </label>
                                <input type="text" className="w-full input" id="postal-code" placeholder="564-879" />
                            </div>
                            <div className="flex items-center gap-3">
                                <input className="checkbox checkbox-sm" type="checkbox" id="set-as-permanent" />
                                <label className="label" htmlFor="set-as-permanent">
                                    Set as permanent
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="bg-base-100 shadow card">
                    <div className="card-body">
                        <div className="card-title">Upload Image</div>
                        <div className="mt-4">
                            <FileUploader
                                labelIdle={`<div>Drag and Drop your files or <span style="text-decoration: underline">Browse</span></div>`}
                            />
                        </div>
                    </div>
                </div>
                <div className="bg-base-100 shadow card">
                    <div className="gap-0 card-body">
                        <div className="card-title">Create Password</div>
                        <div className="gap-4 grid grid-cols-1 lg:grid-cols-2 mt-2 fieldset">
                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="password">
                                    Password
                                </label>
                                <label className="focus:outline-0 w-full input">
                                    <Icon icon="lucide--key-round" className="size-4 text-base-content/60" aria-hidden />
                                    <input
                                        id="password"
                                        className="focus:outline-0 grow"
                                        placeholder="Password"
                                        type={showPassword ? "text" : "password"}
                                    />
                                    <button
                                        className="text-base-content/60 btn btn-xs btn-ghost btn-circle"
                                        aria-label="Confirm Password"
                                        onClick={() => setShowPassword(!showPassword)}>
                                        {showPassword ? (
                                            <Icon icon="lucide--eye-off" className="size-4" aria-hidden />
                                        ) : (
                                            <Icon icon="lucide--eye" className="size-4" aria-hidden />
                                        )}
                                    </button>
                                </label>
                            </div>
                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="confirm-password">
                                    Confirm Password
                                </label>
                                <label className="focus:outline-0 w-full input">
                                    <Icon icon="lucide--key-round" className="size-4 text-base-content/60" aria-hidden />
                                    <input
                                        id="confirm-password"
                                        className="focus:outline-0 grow"
                                        placeholder="Confirm Password"
                                        type={showPassword ? "text" : "password"}
                                    />
                                    <button
                                        className="text-base-content/60 btn btn-xs btn-ghost btn-circle"
                                        aria-label="Confirm Password"
                                        onClick={() => setShowPassword(!showPassword)}>
                                        {showPassword ? (
                                            <Icon icon="lucide--eye-off" className="size-4" aria-hidden />
                                        ) : (
                                            <Icon icon="lucide--eye" className="size-4" aria-hidden />
                                        )}
                                    </button>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
                <Link className="btn btn-sm btn-ghost" to="/apps/ecommerce/sellers">
                    <Icon icon="lucide--x" className="size-4" aria-hidden />
                    Cancel
                </Link>
                <Link className="btn btn-sm btn-primary" to="/apps/ecommerce/sellers">
                    <Icon icon="lucide--check" className="size-4" aria-hidden />
                    Save
                </Link>
            </div>
        </div>
    );
};
