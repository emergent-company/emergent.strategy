export const Pricing = () => {
    return (
        <div className="group/section container py-8 md:py-12 lg:py-16 2xl:py-28" id="pricing">
            <div className="flex items-center justify-center gap-1.5">
                <div className="bg-primary/80 h-4 w-0.5 translate-x-1.5 rounded-full opacity-0 transition-all group-hover/section:translate-x-0 group-hover/section:opacity-100" />
                <p className="text-base-content/60 group-hover/section:text-primary font-mono text-sm font-medium transition-all">
                    Scalable Pricing
                </p>
                <div className="bg-primary/80 h-4 w-0.5 -translate-x-1.5 rounded-full opacity-0 transition-all group-hover/section:translate-x-0 group-hover/section:opacity-100" />
            </div>
            <p className="mt-2 text-center text-2xl font-semibold sm:text-3xl">Flexible Pricing for Every Business</p>
            <div className="mt-2 flex justify-center text-center">
                <p className="text-base-content/80 max-w-lg">
                    Pick a plan that fits your needs. Upgrade anytime as you grow.
                </p>
            </div>

            <div className="mt-6 flex items-center justify-center lg:mt-8 2xl:mt-12">
                <div className="tabs tabs-box tabs-sm relative">
                    <label className="tab">
                        <input type="radio" name="plan_duration" value="monthly" />
                        <p className="mx-2">Monthly</p>
                    </label>

                    <label className="tab gap-0">
                        <input type="radio" name="plan_duration" defaultChecked value="yearly" />
                        <div className="gap mx-2 flex items-center gap-1.5">
                            <span className="iconify lucide--award size-4"></span>
                            <p>Yearly</p>
                        </div>
                    </label>
                    <div className="*:stroke-success/80 absolute -end-10 -bottom-6 -rotate-40 max-sm:hidden">
                        <svg className="h-14" viewBox="0 0 111 111" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path
                                d="M24.2436 22.2464C21.9361 40.1037 24.1434 58.4063 36.2372 72.8438C47.1531 85.8753 63.0339 89.4997 72.0241 72.3997C76.2799 64.3049 75.9148 51.8626 68.2423 45.8372C59.6944 39.1242 52.5684 51.4637 52.3146 58.6725C51.7216 75.5092 64.21 92.4339 82.5472 94.5584C104.262 97.0741 103.365 74.6027 103.226 74.6577"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                            <path
                                d="M8.04486 34.0788C9.99828 33.6914 11.5767 32.5391 13.211 31.4701C18.5769 27.9613 23.2345 22.4666 24.743 16.0889C25.3522 23.1615 28.5274 32.1386 35.2148 35.4439"
                                stroke="inherit"
                                strokeWidth="4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </div>
                    <p className="text-success absolute -end-30 bottom-4 text-sm font-semibold max-sm:hidden">
                        2 Months Free
                    </p>
                </div>
            </div>
            <div className="mt-6 grid grid-cols-1 gap-8 lg:mt-12 xl:grid-cols-3 2xl:mt-16">
                <div className="card bg-base-100 border-base-300 flex flex-col border border-dashed p-6">
                    <div className="flex justify-between gap-3">
                        <div>
                            <p className="text-2xl font-semibold">Launch</p>
                            <p className="text-base-content/80 text-sm">Individuals & Small Teams</p>
                        </div>
                    </div>
                    <div className="mt-6 text-center">
                        <p className="text-5xl leading-0 font-semibold">
                            <span className="text-base-content/80 align-super text-xl font-medium">$</span>
                            <span className="relative inline-block h-8 w-12">
                                <span className="absolute start-0 top-1/2 translate-y-1/2 scale-0 opacity-0 transition-all duration-500 group-has-[[value=yearly]:checked]/section:scale-100 group-has-[[value=yearly]:checked]/section:opacity-100">
                                    29
                                </span>
                                <span className="absolute start-0 top-1/2 translate-y-1/2 scale-0 opacity-0 transition-all duration-500 group-has-[[value=monthly]:checked]/section:scale-100 group-has-[[value=monthly]:checked]/section:opacity-100">
                                    39
                                </span>
                            </span>
                        </p>
                        <p className="text-base-content/80 mt-3 text-sm">/user/month</p>
                    </div>
                    <p className="text-base-content/80 mt-6 text-sm font-medium">Capabilities</p>
                    <div className="mt-2.5 space-y-1.5">
                        <div className="flex items-center gap-2">
                            <span className="iconify lucide--check text-success size-4.5"></span>
                            10 Active Workflows
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="iconify lucide--check text-success size-4.5"></span>
                            Essential Integrations
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="iconify lucide--check text-success size-4.5"></span>
                            Basic Logs & Tracking
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="iconify lucide--check text-success size-4.5"></span>
                            Multi-Step Automations
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="iconify lucide--x text-error size-4.5"></span>
                            AI Optimization
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="iconify lucide--x text-error size-4.5"></span>
                            Custom API & Webhooks
                        </div>
                    </div>
                    <p className="text-base-content/70 mt-12 text-center font-medium italic">
                        "Perfect for solo users and small teams starting with automation"
                    </p>
                    <button className="btn btn-outline border-base-300 mt-6 gap-2.5">
                        <span className="iconify lucide--flag size-4"></span>Get started
                    </button>
                </div>
                <div className="card bg-base-100 border-base-300 flex flex-col border p-6">
                    <div className="flex justify-between gap-3">
                        <p className="text-primary text-2xl font-semibold">Scale</p>
                        <div className="badge badge-primary badge-sm shadow-primary/10 shadow-lg">Most Popular</div>
                    </div>
                    <p className="text-base-content/80 text-sm">Grow faster, automate smarter</p>
                    <div className="mt-6 text-center">
                        <p className="text-primary text-5xl leading-0 font-semibold">
                            <span className="text-base-content/80 align-super text-xl font-medium">$</span>
                            <span className="relative inline-block h-8 w-12">
                                <span className="absolute start-0 top-1/2 translate-y-1/2 scale-0 opacity-0 transition-all duration-500 group-has-[[value=yearly]:checked]/section:scale-100 group-has-[[value=yearly]:checked]/section:opacity-100">
                                    49
                                </span>
                                <span className="absolute start-0 top-1/2 translate-y-1/2 scale-0 opacity-0 transition-all duration-500 group-has-[[value=monthly]:checked]/section:scale-100 group-has-[[value=monthly]:checked]/section:opacity-100">
                                    59
                                </span>
                            </span>
                        </p>
                        <p className="text-base-content/80 mt-3 text-sm">/user/month</p>
                    </div>

                    <p className="text-base-content/80 mt-6 text-sm font-medium">Capabilities</p>
                    <div className="mt-2.5 space-y-1.5">
                        <div className="flex items-center gap-2">
                            <span className="iconify lucide--check text-success size-4.5"></span>
                            Unlimited Workflows
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="iconify lucide--check text-success size-4.5"></span>
                            Advanced Integrations
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="iconify lucide--check text-success size-4.5"></span>
                            Workflow Analytics
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="iconify lucide--check text-success size-4.5"></span>
                            Conditional Logic
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="iconify lucide--check text-success size-4.5"></span>
                            Priority Support
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="iconify lucide--x text-error size-4.5"></span>
                            Enterprise Security
                        </div>
                    </div>
                    <p className="text-base-content/70 mt-12 text-center font-medium italic">
                        "For teams looking for deeper automation control and advanced insights"
                    </p>
                    <button className="btn btn-primary mt-6 gap-2.5">
                        <span className="iconify lucide--rocket size-4"></span>
                        Start Free Trial
                    </button>
                </div>
                <div className="card bg-base-100 border-base-300 flex flex-col border p-6">
                    <div className="flex justify-between gap-3">
                        <p className="text-2xl font-semibold">Power</p>
                        <div className="badge badge-neutral badge-sm shadow-neutral/10 shadow-lg">Enterprise</div>
                    </div>
                    <p className="text-base-content/80 text-sm">Large Teams & Custom Needs</p>

                    <div className="mt-6 text-center">
                        <p className="text-5xl leading-0 font-semibold">
                            <span className="text-base-content/80 align-super text-xl font-medium">$</span>
                            <span className="relative inline-block h-8 w-12">
                                <span className="absolute start-0 top-1/2 translate-y-1/2 scale-0 opacity-0 transition-all duration-500 group-has-[[value=yearly]:checked]/section:scale-100 group-has-[[value=yearly]:checked]/section:opacity-100">
                                    79
                                </span>
                                <span className="absolute start-0 top-1/2 translate-y-1/2 scale-0 opacity-0 transition-all duration-500 group-has-[[value=monthly]:checked]/section:scale-100 group-has-[[value=monthly]:checked]/section:opacity-100">
                                    89
                                </span>
                            </span>
                        </p>
                        <p className="text-base-content/80 mt-3 text-sm">/user/month</p>
                    </div>
                    <p className="text-base-content/80 mt-6 text-sm font-medium">Capabilities</p>
                    <div className="mt-2.5 space-y-1.5">
                        <div className="flex items-center gap-2">
                            <span className="iconify lucide--check text-success size-4.5"></span>
                            Custom API & Webhooks
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="iconify lucide--check text-success size-4.5"></span>
                            Enterprise Security
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="iconify lucide--check text-success size-4.5"></span>
                            AI Workflow Optimization
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="iconify lucide--check text-success size-4.5"></span>
                            Unlimited Users & Roles
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="iconify lucide--check text-success size-4.5"></span>
                            Dedicated Manager
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="iconify lucide--check text-success size-4.5"></span>
                            24/7 Priority Support
                        </div>
                    </div>
                    <p className="text-base-content/70 mt-12 text-center font-medium italic">
                        "Full automation control with enterprise-level security and dedicated support"
                    </p>
                    <button className="btn btn-neutral mt-6 gap-2.5">
                        <span className="iconify lucide--zap size-4"></span>Contact Sales
                    </button>
                </div>
            </div>
        </div>
    );
};
