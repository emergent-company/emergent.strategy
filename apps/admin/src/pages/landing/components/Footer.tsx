import { Link } from "react-router";

import { Logo } from "@/components/Logo";

export const Footer = () => {
    return (
        <div className="relative">
            <div className="grainy absolute inset-0 z-0 opacity-20"></div>

            <div className="relative z-[2] container pt-8 md:pt-12 xl:pt-16 2xl:pt-24">
                <div className="grid grid-cols-2 gap-6 md:grid-cols-5">
                    <div className="col-span-2">
                        <Logo />

                        <p className="text-base-content/80 mt-3 max-sm:text-sm">
                            Launch powerful modern dashboards with customizable apps, components, blocks and
                            integrations designed to accelerate workflows and boost efficiency.
                        </p>
                        <div className="mt-6 flex items-center gap-2.5 xl:mt-16">
                            <Link className="btn btn-sm btn-circle" to="https://github.com/withden" target="_blank">
                                <span className="iconify lucide--github size-4" />
                            </Link>
                            <Link className="btn btn-sm btn-circle" to="https://x.com/withden_" target="_blank">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="24"
                                    height="24"
                                    viewBox="0 0 24 24"
                                    className="size-4">
                                    <path
                                        fill="none"
                                        stroke="currentColor"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="1.7"
                                        d="m3 21l7.548-7.548M21 3l-7.548 7.548m0 0L8 3H3l7.548 10.452m2.904-2.904L21 21h-5l-5.452-7.548"
                                        color="currentColor"
                                    />
                                </svg>
                            </Link>
                            <Link to="https://withden.dev/" className="btn btn-sm btn-circle">
                                <span className="iconify lucide--link size-3.5" />
                            </Link>
                        </div>
                    </div>
                    <div className="max-md:hidden xl:col-span-1"></div>
                    <div className="col-span-1">
                        <p className="font-medium">Quick Links</p>
                        <div className="text-base-content/80 *:hover:text-base-content mt-5 flex flex-col space-y-1.5 *:cursor-pointer">
                            <span>Dashboard</span>
                            <span>UI Kit</span>
                            <span>Login</span>
                            <p className="flex items-center gap-1.5">
                                Feedback <span className="badge badge-sm h-4.5 rounded-full px-1.5">New</span>
                            </p>
                        </div>
                    </div>
                    <div className="col-span-1">
                        <p className="font-medium">Company</p>
                        <div className="text-base-content/80 *:hover:text-base-content mt-5 flex flex-col space-y-1.5 *:cursor-pointer">
                            <span>About</span>
                            <p className="flex items-center gap-1.5">
                                Career
                                <span className="badge badge-sm badge-success h-4.5 rounded-full px-1.5">Hiring</span>
                            </p>
                            <span>Blog</span>
                            <span>Contact</span>
                            <span>Support</span>
                        </div>
                    </div>
                </div>
                <div className="border-base-300 mt-12 flex flex-wrap justify-between gap-3 border-t py-6">
                    <p>
                        Built and designed with care by{" "}
                        <Link to="https://withden.dev/" target="_blank" className="text-primary">
                            Denish
                        </Link>
                    </p>
                    <span>
                        🌼 Made with
                        <Link className="link-hover link-primary ms-1" to="https://daisyui.com" target="_blank">
                            daisyUI
                        </Link>
                    </span>
                </div>
            </div>

            <p className="text-base-content/5 -mt-12 flex h-[195px] justify-center overflow-hidden text-[200px] font-black tracking-[12px] whitespace-nowrap select-none max-lg:hidden">
                NEXUS DESIGN
            </p>
        </div>
    );
};
