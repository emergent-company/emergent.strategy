import React, { useState } from "react";
import { Link } from "react-router";

import { Logo } from "@/components/Logo";
import { MetaData } from "@/components/MetaData";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/contexts/auth";

const LoginPage = () => {
    const [showPassword, setShowPassword] = useState(false);
    const { login } = useAuth();

    return (
        <>
            <MetaData title="Login" />
            <div className="flex flex-col items-stretch p-6 md:p-8 lg:p-16">
                <div className="flex justify-between items-center">
                    <Link to="/admin">
                        <Logo />
                    </Link>
                    <ThemeToggle className="border-base-300 btn-outline btn btn-circle" />
                </div>
                <h3 className="mt-8 md:mt-12 lg:mt-24 font-semibold text-xl text-center">Login</h3>
                <h3 className="mt-2 text-sm text-base-content/70 text-center">
                    Seamless Access, Secure Connection: Your Gateway to a Personalized Experience.
                </h3>
                <div className="mt-6 md:mt-10">
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

                    <div className="text-end">
                        <Link className="text-xs text-base-content/80 label-text" to="/auth/forgot-password">
                            Forgot Password?
                        </Link>
                    </div>

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

                    <button onClick={() => login()} className="gap-3 mt-4 md:mt-6 max-w-full btn btn-primary btn-wide">
                        <span className="size-4 iconify lucide--log-in" />
                        Continue with SSO
                    </button>

                    <button onClick={() => login()} className="gap-3 mt-4 border-base-300 max-w-full btn btn-ghost btn-wide">
                        <img src="/images/brand-logo/google-mini.svg" className="size-6" alt="" />
                        Login with Google
                    </button>

                    <p className="mt-4 md:mt-6 text-sm text-base-content/80 text-center">
                        Haven&apos;t account
                        <Link className="ms-1 text-primary hover:underline" to="/auth/register">
                            Create One
                        </Link>
                    </p>
                </div>
            </div>
        </>
    );
};

export default LoginPage;
