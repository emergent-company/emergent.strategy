import React, { useState, useCallback, useEffect } from "react";
import { Link, useNavigate } from "react-router";

import { Logo } from "@/components/Logo";
import { MetaData } from "@/components/MetaData";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/contexts/auth";
import { Icon } from "@/components/ui/Icon";

const LoginPage = () => {
    const [showPassword, setShowPassword] = useState(false);
    const { login, authMode, isAuthenticated } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const isCredentials = authMode === 'credentials';
    const nav = useNavigate();

    // If already authenticated, bounce to admin
    useEffect(() => {
        if (isAuthenticated) {
            nav('/admin', { replace: true });
        }
    }, [isAuthenticated, nav]);

    const handleSubmit = useCallback(async () => {
        setError(null);
        if (isCredentials) {
            if (!email || !password) return; // should already be disabled
            try {
                setSubmitting(true);
                await login(email, password);
                // After credentials login we stay on this page, so navigate manually
                nav('/admin', { replace: true });
            } catch (e: any) {
                setError(e?.message || 'Login failed');
            } finally {
                setSubmitting(false);
            }
        } else {
            try {
                setSubmitting(true);
                await login(); // triggers redirect
            } catch (e: any) {
                setError(e?.message || 'Redirect failed');
                setSubmitting(false);
            }
        }
    }, [isCredentials, email, password, login, nav]);

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
                <form
                    className="mt-6 md:mt-10"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (!submitting) {
                            void handleSubmit();
                        }
                    }}
                >
                    <fieldset className="fieldset">
                        <legend className="fieldset-legend">Email Address</legend>
                        <label className="focus:outline-0 w-full input">
                            <Icon icon="lucide--mail" className="size-5 text-base-content/80" ariaLabel="Email" />
                            <input
                                name="email"
                                id="email"
                                className="focus:outline-0 grow"
                                placeholder="Email Address"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                autoComplete="email"
                            />
                        </label>
                    </fieldset>

                    <fieldset className="fieldset">
                        <legend className="fieldset-legend">Password</legend>
                        <label className="focus:outline-0 w-full input">
                            <Icon icon="lucide--key-round" className="size-5 text-base-content/80" ariaLabel="Password" />
                            <input
                                id="password"
                                name="password"
                                className="focus:outline-0 grow"
                                placeholder="Password"
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete={isCredentials ? 'current-password' : 'off'}
                            />
                            <button
                                className="btn btn-xs btn-ghost btn-circle"
                                onClick={() => setShowPassword(!showPassword)}
                                aria-label="Password">
                                {showPassword ? (
                                    <Icon icon="lucide--eye-off" className="size-4" ariaLabel="Hide password" />
                                ) : (
                                    <Icon icon="lucide--eye" className="size-4" ariaLabel="Show password" />
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

                    {!isCredentials && (
                        <p className="mt-2 text-xs text-base-content/60">Password field is ignored in SSO mode.</p>
                    )}

                    {error && (
                        <div role="alert" className="mt-4 alert alert-error">
                            <Icon icon="lucide--alert-triangle" ariaLabel="Error" />
                            <span className="text-sm">{error}</span>
                        </div>
                    )}

                    <button
                        name="signin"
                        onClick={(e) => { e.preventDefault(); void handleSubmit(); }}
                        className="gap-3 mt-4 md:mt-6 max-w-full btn btn-primary btn-wide"
                        disabled={submitting || (isCredentials && (!email || !password))}
                    >
                        {submitting && <span className="loading loading-spinner loading-sm" />}
                        <Icon icon="lucide--log-in" className="size-4" ariaLabel="Login" />
                        {isCredentials ? (submitting ? 'Signing In...' : 'Sign In') : (submitting ? 'Redirecting...' : 'Continue with SSO')}
                    </button>

                    {!isCredentials && (
                        <button onClick={(e) => { e.preventDefault(); void handleSubmit(); }} className="gap-3 mt-4 border-base-300 max-w-full btn btn-ghost btn-wide" disabled={submitting}>
                            <img src="/images/brand-logo/google-mini.svg" className="size-6" alt="" />
                            Login with Google
                        </button>
                    )}

                    <p className="mt-4 md:mt-6 text-sm text-base-content/80 text-center">
                        Haven&apos;t account
                        <Link className="ms-1 text-primary hover:underline" to="/auth/register">
                            Create One
                        </Link>
                    </p>
                </form>
            </div>
        </>
    );
};

export default LoginPage;
