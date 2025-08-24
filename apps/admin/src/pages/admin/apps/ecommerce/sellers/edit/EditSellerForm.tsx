import React, { useState } from "react";
import { Link } from "react-router";

import { FileUploader } from "@/components/forms/FileUploader";

export const EditSellerForm = () => {
    const [showPassword, setShowPassword] = useState(false);

    return (
        <div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="card bg-base-100 shadow">
                    <div className="card-body">
                        <div className="card-title">Basic Information</div>
                        <div className="fieldset mt-2 grid grid-cols-1 gap-4 lg:grid-cols-2">
                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="name">
                                    Name
                                </label>
                                <input
                                    type="text"
                                    className="input w-full"
                                    placeholder="Name"
                                    id="name"
                                    defaultValue="Anthony S. Amaya"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="fieldset-label">Email</label>
                                <input
                                    type="email"
                                    className="input w-full"
                                    placeholder="Email"
                                    id="email"
                                    defaultValue="antho.am@yahoo.com"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="fieldset-label">Mobile</label>
                                <input
                                    type="tel"
                                    className="input w-full"
                                    placeholder="(098) 765 4321"
                                    defaultValue="402-788-1602"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="DOB">
                                    DOB
                                </label>
                                <input
                                    type="date"
                                    className="input w-full"
                                    aria-label="DOB"
                                    defaultValue="2000-05-28"
                                    id="DOB"
                                />
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
                <div className="card bg-base-100 shadow">
                    <div className="card-body">
                        <div className="card-title">Address</div>
                        <div className="fieldset mt-2 grid grid-cols-1 gap-4 lg:grid-cols-2">
                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="street-address">
                                    Street Address
                                </label>
                                <input
                                    type="text"
                                    className="input w-full"
                                    id="street-address"
                                    placeholder="Street Address"
                                    defaultValue="906 Broadway"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="city">
                                    City
                                </label>
                                <input
                                    type="text"
                                    className="input w-full"
                                    id="city"
                                    placeholder="City"
                                    defaultValue="Bayonne"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="state">
                                    State
                                </label>
                                <input
                                    type="text"
                                    className="input w-full"
                                    id="state"
                                    placeholder="State"
                                    defaultValue="New Jersey"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="postal-code">
                                    Postal Code
                                </label>
                                <input
                                    type="text"
                                    className="input w-full"
                                    id="postal-code"
                                    placeholder="564-879"
                                    defaultValue="07002"
                                />
                            </div>
                            <div className="flex items-center gap-3">
                                <input
                                    className="checkbox checkbox-sm"
                                    type="checkbox"
                                    id="set-as-permanent"
                                    defaultChecked
                                />
                                <label className="label" htmlFor="set-as-permanent">
                                    Set as permanent
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="card bg-base-100 shadow">
                    <div className="card-body">
                        <div className="card-title">Upload Image</div>
                        <div className="mt-4">
                            <FileUploader
                                files={["/images/avatars/5.png"]}
                                labelIdle={`<div>Drag and Drop your files or <span style="text-decoration: underline">Browse</span></div>`}
                            />
                        </div>
                    </div>
                </div>
                <div className="bg-base-100 card h-fit shadow">
                    <div className="card-body gap-0">
                        <div className="card-title">Change Password</div>
                        <div className="fieldset mt-2 grid grid-cols-1 gap-4 lg:grid-cols-2">
                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="old-password">
                                    Old Password
                                </label>
                                <label className="input w-full focus:outline-0">
                                    <span className="iconify lucide--key-round text-base-content/60 size-4" />
                                    <input
                                        className="grow focus:outline-0"
                                        placeholder="Old Password"
                                        type={showPassword ? "text" : "password"}
                                        id="old-password"
                                    />
                                    <button
                                        className="btn btn-xs btn-ghost btn-circle text-base-content/60"
                                        aria-label="Old Password"
                                        onClick={() => setShowPassword(!showPassword)}>
                                        {showPassword ? (
                                            <span className="iconify lucide--eye-off size-4" />
                                        ) : (
                                            <span className="iconify lucide--eye size-4" />
                                        )}
                                    </button>
                                </label>
                            </div>
                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="new-password">
                                    New Password
                                </label>
                                <label className="input w-full focus:outline-0">
                                    <span className="iconify lucide--key-round text-base-content/60 size-4" />
                                    <input
                                        className="grow focus:outline-0"
                                        placeholder="New Password"
                                        type={showPassword ? "text" : "password"}
                                        id="new-password"
                                    />
                                    <button
                                        className="btn btn-xs btn-ghost btn-circle text-base-content/60"
                                        aria-label="New Password"
                                        onClick={() => setShowPassword(!showPassword)}>
                                        {showPassword ? (
                                            <span className="iconify lucide--eye-off size-4" />
                                        ) : (
                                            <span className="iconify lucide--eye size-4" />
                                        )}
                                    </button>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
                <Link className="btn btn-sm btn-ghost" to="/apps/ecommerce/sellers">
                    <span className="iconify lucide--x size-4" />
                    Cancel
                </Link>
                <Link className="btn btn-sm btn-primary" to="/apps/ecommerce/sellers">
                    <span className="iconify lucide--arrow-up-from-line size-4" />
                    Update
                </Link>
            </div>
        </div>
    );
};
