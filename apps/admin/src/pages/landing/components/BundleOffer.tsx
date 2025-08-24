import { Link } from "react-router";

export const BundleOffer = () => {
    return (
        <div className="container pt-8 pb-12 md:pt-12 md:pb-18 xl:pt-16 xl:pb-24 2xl:pt-24 2xl:pb-36" id="bundle">
            <div className="text-center">
                <div className="rounded-box inline-flex items-center border border-purple-500/10 bg-purple-500/5 p-2 text-purple-500">
                    <span className="iconify lucide--package-search size-5" />
                </div>
                <p className="mt-4 text-2xl font-semibold sm:text-3xl">The Powerful Admin & Startup Solution</p>
                <p className="text-base-content/70 mt-3 inline-block max-w-lg max-sm:text-sm">
                    Accelerate your projects with a flexible dashboard and landing template designed for startup growth
                    and business success.
                </p>
            </div>
            <div className="mt-8 grid gap-6 lg:mt-16 lg:grid-cols-2">
                <Link
                    to="https://daisyui.com/store/475050/"
                    className="border-base-300 bg-base-100 h-fit rounded-md border p-6"
                    target="_blank">
                    <p className="text-base-content/60 font-medium italic">
                        Looking for <span className="underline">Startup</span>
                    </p>
                    <div className="mt-5">
                        <img src="/images/landing/scalo-logo-light.svg" className="h-6.5 dark:hidden" alt="Scalo" />
                        <img
                            src="/images/landing/scalo-logo-dark.svg"
                            className="hidden h-6.5 dark:inline"
                            alt="Scalo"
                        />
                    </div>
                    <p className="text-base-content/70 mt-5">
                        Scalo and Nexus make your admin dashboard feel less like work and more like launching your next
                        big thing. Smart, fast, focused, and beautifully built for startups.
                    </p>
                    <div className="flex justify-center">
                        <button className="btn btn-primary mt-5 gap-3 text-base">
                            <span className="iconify lucide--plane-takeoff size-4 sm:size-5" />
                            Get Scalo
                        </button>
                    </div>
                </Link>
                <Link
                    className="from-primary to-secondary group h-fit rounded-md bg-linear-to-br p-0.5"
                    to="https://daisyui.com/store/244268/"
                    target="_blank">
                    <div className="bg-base-100 rounded-box">
                        <div className="from-primary/5 to-secondary/5 group-hover:from-primary/10 group-hover:to-secondary/10 relative bg-linear-to-br p-6 transition-all">
                            <p className="text-base-content/60 font-medium italic">Bundle Offer</p>
                            <div className="mt-5 flex items-center gap-4">
                                <img src="/images/logo/logo-light.svg" className="h-5 dark:hidden" alt="Scalo" />
                                <img src="/images/logo/logo-dark.svg" className="hidden h-5 dark:inline" alt="Scalo" />
                                <span className="iconify lucide--plus text-base-content/50 size-5"></span>
                                <img
                                    src="/images/landing/scalo-logo-light.svg"
                                    className="h-6.5 dark:hidden"
                                    alt="Scalo"
                                />
                                <img
                                    src="/images/landing/scalo-logo-dark.svg"
                                    className="hidden h-6.5 dark:inline"
                                    alt="Scalo"
                                />
                            </div>
                            <p className="text-base-content/80 mt-4">
                                Get <span className="text-primary font-semibold">Nexus Dashboard</span> and{" "}
                                <span className="text-secondary font-semibold">Scalo Startup Template</span> together at
                                a discounted price. The perfect combo for building and managing modern web projects
                                effortlessly.
                            </p>
                            <div className="mt-5 flex justify-center">
                                <button className="btn shadow-primary-content/20 from-primary to-secondary text-primary-content gap-3 border-0 bg-linear-to-br text-base shadow-inner">
                                    <span className="iconify lucide--package size-4 sm:size-5" />
                                    Get Bundle
                                </button>
                            </div>
                            <p className="absolute end-4 top-4 font-medium text-orange-600 dark:text-orange-400">
                                Special Discount
                            </p>
                        </div>
                    </div>
                </Link>
            </div>
        </div>
    );
};
