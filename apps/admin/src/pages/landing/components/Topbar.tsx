"use client";

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";

import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

export const Topbar = () => {
    const [scrollPosition, setScrollPosition] = useState<number>(0);
    const [scrolling, setScrolling] = useState<"up" | "down" | undefined>(undefined);

    const [prevScrollPosition, setPrevScrollPosition] = useState<number>(0);

    const handleScroll = useCallback(() => {
        setTimeout(() => {
            setPrevScrollPosition(scrollPosition);
            setScrollPosition(window.scrollY);
        }, 200);
    }, [scrollPosition]);

    useEffect(() => {
        window.addEventListener("scroll", handleScroll, { passive: true });
        if (scrollPosition < 500) {
            setScrolling(undefined);
        } else {
            if (scrollPosition - prevScrollPosition > 0) {
                setScrolling("down");
            } else if (scrollPosition - prevScrollPosition < 0) {
                setScrolling("up");
            }
        }
        handleScroll();
        return () => {
            window.removeEventListener("scroll", handleScroll);
        };
    }, [handleScroll, prevScrollPosition, scrollPosition]);

    return (
        <>
            <div
                data-scrolling={scrolling}
                data-at-top={scrollPosition < 30}
                className="group fixed inset-x-0 z-[60] flex justify-center transition-[top] duration-500 data-[scrolling=down]:-top-full sm:container [&:not([data-scrolling=down])]:top-0 [&:not([data-scrolling=down])]:sm:top-4">
                <div className="group-data-[at-top=false]:bg-base-100 group-data-[at-top=false]:dark:bg-base-200 flex w-full items-center justify-between px-3 py-3 transition-all duration-500 group-data-[at-top=false]:w-[800px] group-data-[at-top=false]:shadow sm:rounded-full sm:px-6 lg:py-1.5">
                    <div className="flex items-center gap-2">
                        <div className="flex-none lg:hidden">
                            <div className="drawer">
                                <input id="landing-menu-drawer" type="checkbox" className="drawer-toggle" />
                                <div className="drawer-content">
                                    <label
                                        htmlFor="landing-menu-drawer"
                                        className="btn drawer-button btn-ghost btn-square btn-sm">
                                        <span className="iconify lucide--menu size-4.5" />
                                    </label>
                                </div>
                                <div className="drawer-side z-[50]">
                                    <label
                                        htmlFor="landing-menu-drawer"
                                        aria-label="close sidebar"
                                        className="drawer-overlay"></label>
                                    <ul className="menu bg-base-100 text-base-content min-h-full w-80 p-4">
                                        <li>
                                            <Link to="/dashboards/ecommerce">Dashboard</Link>
                                        </li>
                                        <li>
                                            <Link to="/components">Components</Link>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        <Link to="/dashboards/ecommerce">
                            <Logo />
                        </Link>
                    </div>
                    <ul className="menu menu-horizontal hidden gap-2 px-0 lg:inline-flex">
                        <li>
                            <Link to="/dashboards/ecommerce">Dashboard</Link>
                        </li>
                        <li>
                            <Link to="/components">Components</Link>
                        </li>
                    </ul>
                    <div className="inline-flex items-center gap-3">
                        <ThemeToggle className="btn btn-square btn-ghost btn-sm border-transparent" />
                        <Link
                            to="https://daisyui.com/store/244268?aff=Db6q2"
                            target="_blank"
                            className="btn from-primary to-secondary group/purchase text-primary-content btn-sm max-sm:btn-square relative gap-2 border-0 bg-linear-to-r text-sm">
                            <span className="iconify lucide--shopping-cart size-4" />
                            <span className="max-sm:hidden">Buy Now</span>
                            <div className="from-primary to-secondary absolute inset-x-0 top-1 -z-1 h-8 bg-linear-to-r opacity-40 blur-md transition-all duration-500 group-hover/purchase:opacity-60 group-hover/purchase:blur-lg"></div>
                        </Link>
                    </div>
                </div>
            </div>
        </>
    );
};
