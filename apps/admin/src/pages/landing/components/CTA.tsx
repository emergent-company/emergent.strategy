import { Link } from "react-router";
import { Icon } from "@/components/ui/Icon";

export const CTA = () => {
    return (
        <div className="sm:px-16 container">
            <div className="relative py-8 md:py-12 xl:py-16 2xl:pt-24 2xl:pb-48 sm:rounded-[60px] overflow-hidden">
                <div className="max-sm:hidden -bottom-40 absolute bg-blue-400 blur-[180px] w-72 h-64 start-16"></div>
                <div className="max-sm:hidden -bottom-40 absolute bg-cyan-400 blur-[180px] w-72 h-64 -translate-x-1/2 start-1/2"></div>
                <div className="max-sm:hidden -bottom-40 absolute bg-purple-400 blur-[180px] w-72 h-64 end-16"></div>
                <div className="max-sm:hidden z-0 absolute inset-0 opacity-20 grainy"></div>
                <div className="absolute inset-x-0 top-0 h-160 bg-linear-to-b from-(--root-bg) to-transparent max-sm:hidden"></div>

                <div className="relative">
                    <div className="text-center">
                        <div className="inline-flex items-center bg-linear-to-tr from-primary to-secondary p-2.5 rounded-full text-primary-content">
                            <Icon icon="lucide--rocket" className="size-5" ariaLabel="Rocket" />
                        </div>
                        <p className="mt-4 font-bold text-xl sm:text-2xl lg:text-4xl">Launch, Manage, and Succeed</p>
                        <p className="inline-block mt-3 max-w-2xl max-sm:text-sm">
                            Pay once, use forever. No subscriptions, only powerful tools and endless possibilities to
                            build with confidence.
                        </p>
                    </div>

                    <div className="flex justify-center mt-6 xl:mt-8">
                        <ul className="space-y-3 max-w-md text-center">
                            <li className="flex items-center gap-2 max-sm:text-sm">
                                <Icon icon="lucide--badge-check" className="size-6 text-green-500" ariaLabel="Check" />
                                Built with Tailwind CSS 4 & DaisyUI 5
                            </li>
                            <li className="flex items-center gap-2 max-sm:text-sm">
                                <Icon icon="lucide--badge-check" className="size-6 text-green-500" ariaLabel="Check" />
                                Lifetime access with free updates
                            </li>
                            <li className="flex items-center gap-2 max-sm:text-sm">
                                <Icon icon="lucide--badge-check" className="size-6 text-green-500" ariaLabel="Check" />
                                Fully responsive & optimized for all devices
                            </li>
                        </ul>
                    </div>
                    <div className="flex justify-center items-center gap-3 sm:gap-5 mt-6 xl:mt-8">
                        <Link
                            to="https://daisyui.com/store/244268"
                            target="_blank"
                            className="group relative gap-3 bg-linear-to-r from-primary to-secondary border-0 text-primary-content text-base btn">
                            <Icon icon="lucide--shopping-cart" className="size-4 sm:size-5" ariaLabel="Buy" />
                            Buy Now
                            <div className="top-2 -z-1 absolute inset-x-1 group-hover:inset-x-0 bg-linear-to-r from-primary to-secondary opacity-40 dark:opacity-20 group-hover:dark:!opacity-40 group-hover:opacity-80 blur-md group-hover:blur-lg h-10 transition-all duration-500"></div>
                        </Link>
                        <a href="#faqs" className="btn btn-ghost">
                            Need help?
                            <Icon icon="lucide--arrow-down" className="size-3.5" ariaLabel="Scroll to FAQs" />
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
};
