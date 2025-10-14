import React, { useState } from "react";
import { Link } from "react-router";

import { Logo, ThemeToggle } from "@/components";
import { MetaData } from "@/components";
import { Icon } from "@/components/atoms/Icon";

const ResetPasswordPage = () => {
    const [showPassword, setShowPassword] = useState(false);

    return (
        <div data-testid="page-auth-reset-password">
            <MetaData title="Reset Password" />
            <div className="flex flex-col items-stretch p-6 md:p-8 lg:p-16">
                <div className="flex justify-between items-center">
                    <Link to="/admin">
                        <Logo />
                    </Link>
                    <ThemeToggle className="border-base-300 btn-outline btn btn-circle" />
                </div>
                <h3 className="mt-8 md:mt-12 lg:mt-24 font-semibold text-xl text-center">Reset Password</h3>
                <h3 className="mt-2 text-sm text-base-content/70 text-center">
                    Seamless Access, Secure Connection: Your Gateway to a Personalized Experience.
                </h3>
                <div className="mt-6 md:mt-10">
                    <fieldset className="fieldset">
                        <legend className="fieldset-legend">Password</legend>
                        <label className="focus:outline-0 w-full input">
                            <Icon icon="lucide--key-round" className="size-5 text-base-content/80" />
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
                                    <Icon icon="lucide--eye-off" className="size-4" />
                                ) : (
                                    <Icon icon="lucide--eye" className="size-4" />
                                )}
                            </button>
                        </label>
                    </fieldset>
                    <fieldset className="fieldset">
                        <legend className="fieldset-legend">Confirm Password</legend>
                        <label className="focus:outline-0 w-full input">
                            <Icon icon="lucide--key-round" className="size-5 text-base-content/80" />
                            <input
                                className="focus:outline-0 grow"
                                placeholder="Confirm Password"
                                type={showPassword ? "text" : "password"}
                            />
                            <button
                                className="btn btn-xs btn-ghost btn-circle"
                                onClick={() => setShowPassword(!showPassword)}
                                aria-label="Password">
                                {showPassword ? (
                                    <Icon icon="lucide--eye-off" className="size-4" />
                                ) : (
                                    <Icon icon="lucide--eye" className="size-4" />
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
                        <Icon icon="lucide--check" className="size-4" />
                        Change Password
                    </Link>

                    <p className="mt-4 md:mt-6 text-sm text-center">
                        Go to
                        <Link className="ms-1.5 text-primary hover:underline" to="/auth/login">
                            Login
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default ResetPasswordPage;
