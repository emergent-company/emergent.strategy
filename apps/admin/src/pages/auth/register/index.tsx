import React, { useState } from "react";
import { Link } from "react-router";

import { Logo, ThemeToggle } from "@/components";
import { MetaData } from "@/components";

const RegisterPage = () => {
    const [showPassword, setShowPassword] = useState(false);

    return (
        <div data-testid="page-auth-register">
            <MetaData title="Register" />

            <div className="flex flex-col items-stretch p-8 lg:p-16">
                <div className="flex justify-between items-center">
                    <Link to="/admin">
                        <Logo />
                    </Link>
                    <ThemeToggle className="border-base-300 btn-outline btn btn-circle" />
                </div>
                <h3 className="mt-8 md:mt-12 lg:mt-24 font-semibold text-xl text-center">Register</h3>
                <h3 className="mt-2 text-sm text-base-content/70 text-center">
                    Seamless Access, Secure Connection: Your Gateway to a Personalized Experience.
                </h3>
                <div className="mt-6 md:mt-10">
                    <div className="gap-x-4 grid grid-cols-1 xl:grid-cols-2">
                        <fieldset className="fieldset">
                            <legend className="fieldset-legend">First Name</legend>
                            <label className="focus:outline-0 w-full input">
                                <span className="size-5 text-base-content/80 iconify lucide--user"></span>
                                <input className="focus:outline-0 grow" placeholder="First Name" type="text" />
                            </label>
                        </fieldset>
                        <fieldset className="fieldset">
                            <legend className="fieldset-legend">Last Name</legend>
                            <label className="focus:outline-0 w-full input">
                                <span className="size-5 text-base-content/80 iconify lucide--user"></span>
                                <input className="focus:outline-0 grow" placeholder="Last Name" type="text" />
                            </label>
                        </fieldset>
                    </div>
                    <fieldset className="fieldset">
                        <legend className="fieldset-legend">Username</legend>
                        <label className="focus:outline-0 w-full input">
                            <span className="size-5 text-base-content/80 iconify lucide--user-square"></span>
                            <input className="focus:outline-0 grow" placeholder="Username" type="text" />
                        </label>
                    </fieldset>
                    <fieldset className="fieldset">
                        <legend className="fieldset-legend">Email Address</legend>
                        <label className="focus:outline-0 w-full input">
                            <span className="size-5 text-base-content/80 iconify lucide--mail"></span>
                            <input className="focus:outline-0 grow" placeholder="Email Address" type="email" />
                        </label>
                    </fieldset>
                    <fieldset className="fieldset">
                        <legend className="fieldset-legend">Password</legend>
                        <label className="focus:outline-0 w-full input">
                            <span className="size-5 text-base-content/80 iconify lucide--key-round"></span>
                            <input
                                className="focus:outline-0 grow"
                                placeholder="Password"
                                type={showPassword ? "text" : "password"}
                            />
                            <button
                                className="btn btn-xs btn-ghost btn-circle"
                                onClick={() => setShowPassword(!showPassword)}
                                aria-label="Password">
                                {showPassword ? (
                                    <span className="size-4 iconify lucide--eye-off" />
                                ) : (
                                    <span className="size-4 iconify lucide--eye" />
                                )}
                            </button>
                        </label>
                    </fieldset>

                    <div className="flex items-center gap-3 mt-4 md:mt-6">
                        <input
                            className="checkbox checkbox-sm checkbox-primary"
                            aria-label="Checkbox example"
                            type="checkbox"
                            id="agreement"
                        />
                        <label htmlFor="agreement" className="text-sm">
                            I agree with
                            <span className="ms-1 text-primary hover:underline cursor-pointer">
                                terms and conditions
                            </span>
                        </label>
                    </div>
                    <Link to="/admin" className="gap-3 mt-4 md:mt-6 max-w-full btn btn-primary btn-wide">
                        <span className="size-4 iconify lucide--user-plus" />
                        Register
                    </Link>

                    <button className="gap-3 mt-4 border-base-300 max-w-full btn btn-ghost btn-wide">
                        <img src="/images/brand-logo/google-mini.svg" className="size-6" alt="" />
                        Register with Google
                    </button>
                    <p className="mt-4 md:mt-6 text-sm text-base-content/80 text-center">
                        I have already to
                        <Link className="ms-1 text-primary hover:underline" to="/auth/login">
                            Login
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default RegisterPage;
