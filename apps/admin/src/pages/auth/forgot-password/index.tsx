import { Link } from "react-router";

import { Logo, ThemeToggle } from "@/components";
import { MetaData } from "@/components";

const ForgotPasswordPage = () => {
    return (
        <div data-testid="page-auth-forgot-password">
            <MetaData title="Forgot Password" />

            <div className="flex flex-col items-stretch p-8 lg:p-16">
                <div className="flex justify-between items-center">
                    <Link to="/admin">
                        <Logo />
                    </Link>
                    <ThemeToggle className="border-base-300 btn-outline btn btn-circle" />
                </div>
                <h3 className="mt-8 md:mt-12 lg:mt-24 font-semibold text-xl text-center">Forgot Password</h3>
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

                    <div className="flex items-center gap-3 mt-2 md:mt-4">
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

                    <Link to="/auth/reset-password" className="gap-3 mt-4 md:mt-6 max-w-full btn btn-primary btn-wide">
                        <span className="size-4 iconify lucide--mail-plus" />
                        Send a reset link
                    </Link>
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

export default ForgotPasswordPage;
