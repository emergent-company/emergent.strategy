import { Link } from "react-router";

export const CTA = () => {
    return (
        <div className="container sm:px-16">
            <div className="relative overflow-hidden py-8 sm:rounded-[60px] md:py-12 xl:py-16 2xl:pt-24 2xl:pb-48">
                <div className="absolute start-16 -bottom-40 h-64 w-72 bg-blue-400 blur-[180px] max-sm:hidden"></div>
                <div className="absolute start-1/2 -bottom-40 h-64 w-72 -translate-x-1/2 bg-cyan-400 blur-[180px] max-sm:hidden"></div>
                <div className="absolute end-16 -bottom-40 h-64 w-72 bg-purple-400 blur-[180px] max-sm:hidden"></div>
                <div className="grainy absolute inset-0 z-0 opacity-20 max-sm:hidden"></div>
                <div className="absolute inset-x-0 top-0 h-160 bg-linear-to-b from-(--root-bg) to-transparent max-sm:hidden"></div>

                <div className="relative">
                    <div className="text-center">
                        <div className="from-primary to-secondary text-primary-content inline-flex items-center rounded-full bg-linear-to-tr p-2.5">
                            <span className="iconify lucide--rocket size-5" />
                        </div>
                        <p className="mt-4 text-xl font-bold sm:text-2xl lg:text-4xl">Launch, Manage, and Succeed</p>
                        <p className="mt-3 inline-block max-w-2xl max-sm:text-sm">
                            Pay once, use forever. No subscriptions, only powerful tools and endless possibilities to
                            build with confidence.
                        </p>
                    </div>

                    <div className="mt-6 flex justify-center xl:mt-8">
                        <ul className="max-w-md space-y-3 text-center">
                            <li className="flex items-center gap-2 max-sm:text-sm">
                                <span className="iconify lucide--badge-check size-6 text-green-500"></span>
                                Built with Tailwind CSS 4 & DaisyUI 5
                            </li>
                            <li className="flex items-center gap-2 max-sm:text-sm">
                                <span className="iconify lucide--badge-check size-6 text-green-500"></span>
                                Lifetime access with free updates
                            </li>
                            <li className="flex items-center gap-2 max-sm:text-sm">
                                <span className="iconify lucide--badge-check size-6 text-green-500"></span>
                                Fully responsive & optimized for all devices
                            </li>
                        </ul>
                    </div>
                    <div className="mt-6 flex items-center justify-center gap-3 sm:gap-5 xl:mt-8">
                        <Link
                            to="https://daisyui.com/store/244268"
                            target="_blank"
                            className="btn from-primary to-secondary group text-primary-content relative gap-3 border-0 bg-linear-to-r text-base">
                            <span className="iconify lucide--shopping-cart size-4 sm:size-5" />
                            Buy Now
                            <div className="from-primary to-secondary absolute inset-x-1 top-2 -z-1 h-10 bg-linear-to-r opacity-40 blur-md transition-all duration-500 group-hover:inset-x-0 group-hover:opacity-80 group-hover:blur-lg dark:opacity-20 group-hover:dark:!opacity-40"></div>
                        </Link>
                        <a href="#faqs" className="btn btn-ghost">
                            Need help?
                            <span className="iconify lucide--arrow-down size-3.5" />
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
};
