import { Link } from "react-router";

import { Logo } from "@/components";
import { Icon } from "@/components/atoms/Icon";

export const Footer = () => {
    return (
        <div className="relative">
            <div className="z-0 absolute inset-0 opacity-20 grainy"></div>

            <div className="z-[2] relative pt-8 md:pt-12 2xl:pt-24 xl:pt-16 container">
                <div className="gap-6 grid grid-cols-2 md:grid-cols-5">
                    <div className="col-span-2">
                        <Logo />

                        <p className="mt-3 max-sm:text-sm text-base-content/80">
                            Launch powerful modern dashboards with customizable apps, components, blocks and
                            integrations designed to accelerate workflows and boost efficiency.
                        </p>
                        <div className="flex items-center gap-2.5 mt-6 xl:mt-16">
                            <Link className="btn btn-sm btn-circle" to="https://github.com/withden" target="_blank">
                                <Icon icon="lucide--github" className="size-4" ariaLabel="GitHub" />
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
                                <Icon icon="lucide--link" className="size-3.5" ariaLabel="Website" />
                            </Link>
                        </div>
                    </div>
                    <div className="max-md:hidden xl:col-span-1"></div>
                    <div className="col-span-1">
                        <p className="font-medium">Quick Links</p>
                        <div className="flex flex-col space-y-1.5 mt-5 text-base-content/80 *:hover:text-base-content *:cursor-pointer">
                            <span>Dashboard</span>
                            <span>UI Kit</span>
                            <span>Login</span>
                            <p className="flex items-center gap-1.5">
                                Feedback <span className="px-1.5 rounded-full h-4.5 badge badge-sm">New</span>
                            </p>
                        </div>
                    </div>
                    <div className="col-span-1">
                        <p className="font-medium">Company</p>
                        <div className="flex flex-col space-y-1.5 mt-5 text-base-content/80 *:hover:text-base-content *:cursor-pointer">
                            <span>About</span>
                            <p className="flex items-center gap-1.5">
                                Career
                                <span className="px-1.5 rounded-full h-4.5 badge badge-sm badge-success">Hiring</span>
                            </p>
                            <span>Blog</span>
                            <span>Contact</span>
                            <span>Support</span>
                        </div>
                    </div>
                </div>
                <div className="flex flex-wrap justify-between gap-3 mt-12 py-6 border-t border-base-300">
                    <p>
                        Built and designed with care by{" "}
                        <Link to="https://withden.dev/" target="_blank" className="text-primary">
                            Denish
                        </Link>
                    </p>
                    <span>
                        🌼 Made with
                        <Link className="ms-1 link-hover link-primary" to="https://daisyui.com" target="_blank">
                            daisyUI
                        </Link>
                    </span>
                </div>
            </div>

            <p className="max-lg:hidden flex justify-center -mt-12 h-[195px] overflow-hidden font-black text-[200px] text-base-content/5 tracking-[12px] whitespace-nowrap select-none">
                NEXUS DESIGN
            </p>
        </div>
    );
};
