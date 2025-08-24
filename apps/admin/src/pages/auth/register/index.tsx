import React, { useState } from "react";
import { Link } from "react-router";

import { Logo } from "@/components/Logo";
import { MetaData } from "@/components/MetaData";
import { ThemeToggle } from "@/components/ThemeToggle";

const RegisterPage = () => {
    const [showPassword, setShowPassword] = useState(false);

    return (
        <>
            <MetaData title="Register" />

            <div className="flex flex-col items-stretch p-8 lg:p-16">
                <div className="flex items-center justify-between">
                    <Link to="/dashboards/ecommerce">
                        <Logo />
                    </Link>
                    <ThemeToggle className="btn btn-circle btn-outline border-base-300" />
                </div>
                <h3 className="mt-8 text-center text-xl font-semibold md:mt-12 lg:mt-24">Register</h3>
                <h3 className="text-base-content/70 mt-2 text-center text-sm">
                    Seamless Access, Secure Connection: Your Gateway to a Personalized Experience.
                </h3>
                <div className="mt-6 md:mt-10">
                    <div className="grid grid-cols-1 gap-x-4 xl:grid-cols-2">
                        <fieldset className="fieldset">
                            <legend className="fieldset-legend">First Name</legend>
                            <label className="input w-full focus:outline-0">
                                <span className="iconify lucide--user text-base-content/80 size-5"></span>
                                <input className="grow focus:outline-0" placeholder="First Name" type="text" />
                            </label>
                        </fieldset>
                        <fieldset className="fieldset">
                            <legend className="fieldset-legend">Last Name</legend>
                            <label className="input w-full focus:outline-0">
                                <span className="iconify lucide--user text-base-content/80 size-5"></span>
                                <input className="grow focus:outline-0" placeholder="Last Name" type="text" />
                            </label>
                        </fieldset>
                    </div>
                    <fieldset className="fieldset">
                        <legend className="fieldset-legend">Username</legend>
                        <label className="input w-full focus:outline-0">
                            <span className="iconify lucide--user-square text-base-content/80 size-5"></span>
                            <input className="grow focus:outline-0" placeholder="Username" type="text" />
                        </label>
                    </fieldset>
                    <fieldset className="fieldset">
                        <legend className="fieldset-legend">Email Address</legend>
                        <label className="input w-full focus:outline-0">
                            <span className="iconify lucide--mail text-base-content/80 size-5"></span>
                            <input className="grow focus:outline-0" placeholder="Email Address" type="email" />
                        </label>
                    </fieldset>
                    <fieldset className="fieldset">
                        <legend className="fieldset-legend">Password</legend>
                        <label className="input w-full focus:outline-0">
                            <span className="iconify lucide--key-round text-base-content/80 size-5"></span>
                            <input
                                className="grow focus:outline-0"
                                placeholder="Password"
                                type={showPassword ? "text" : "password"}
                            />
                            <button
                                className="btn btn-xs btn-ghost btn-circle"
                                onClick={() => setShowPassword(!showPassword)}
                                aria-label="Password">
                                {showPassword ? (
                                    <span className="iconify lucide--eye-off size-4" />
                                ) : (
                                    <span className="iconify lucide--eye size-4" />
                                )}
                            </button>
                        </label>
                    </fieldset>

                    <div className="mt-4 flex items-center gap-3 md:mt-6">
                        <input
                            className="checkbox checkbox-sm checkbox-primary"
                            aria-label="Checkbox example"
                            type="checkbox"
                            id="agreement"
                        />
                        <label htmlFor="agreement" className="text-sm">
                            I agree with
                            <span className="text-primary ms-1 cursor-pointer hover:underline">
                                terms and conditions
                            </span>
                        </label>
                    </div>
                    <Link to="/dashboards/ecommerce" className="btn btn-primary btn-wide mt-4 max-w-full gap-3 md:mt-6">
                        <span className="iconify lucide--user-plus size-4" />
                        Register
                    </Link>

                    <button className="btn btn-ghost btn-wide border-base-300 mt-4 max-w-full gap-3">
                        <img src="/images/brand-logo/google-mini.svg" className="size-6" alt="" />
                        Register with Google
                    </button>
                    <p className="text-base-content/80 mt-4 text-center text-sm md:mt-6">
                        I have already to
                        <Link className="text-primary ms-1 hover:underline" to="/auth/login">
                            Login
                        </Link>
                    </p>
                </div>
            </div>
        </>
    );
};

export default RegisterPage;
